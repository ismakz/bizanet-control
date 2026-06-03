/**
 * Coupure internet immédiate à l'expiration des tickets hotspot.
 * Tourne en boucle côté serveur (instrumentation) + appelé avant liste tokens.
 */

import { prisma } from "@/lib/prisma";
import { AccessType, TokenStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  agentDisableUser,
  agentForceExpire,
  agentHotspotSnapshot,
  agentRemoveActive,
  isAgentOnline,
  isAgentResultOffline,
} from "@/lib/mikrotik-agent";
import { durationToSeconds } from "@/lib/time";
import { isCloudRouterBlocked } from "@/lib/router-access";

const ENFORCER_INTERVAL_MS = Number(
  process.env.EXPIRATION_ENFORCER_MS || 5000
);

export type ExpirationEnforcerResult = {
  checked: number;
  expired: number;
  disconnected: number;
  alreadyOffline: number;
  errors: string[];
  agentOffline: boolean;
};

type HotspotTokenRow = {
  id: string;
  token: string;
  companyId: string;
  status: TokenStatus;
  accessType: AccessType;
  routerId: string | null;
  assignedCustomerId: string | null;
  totalSeconds: number;
  remainingSeconds: number;
  consumedSeconds: number;
  isOnline: boolean;
  activatedAt: Date | null;
  lastConnectedAt: Date | null;
  expiresAt: Date | null;
  expiredAt: Date | null;
  assignedCustomer?: { username: string } | null;
};

let loopTimer: ReturnType<typeof setInterval> | null = null;
let loopRunning = false;

function computeRemainingSeconds(token: HotspotTokenRow, nowMs: number): number {
  const totalSeconds =
    token.totalSeconds > 0
      ? token.totalSeconds
      : 0;
  const consumedSeconds = token.consumedSeconds ?? 0;
  const baseRemaining =
    token.remainingSeconds > 0
      ? token.remainingSeconds
      : Math.max(0, totalSeconds - consumedSeconds);

  if (!token.isOnline || !token.lastConnectedAt) {
    return baseRemaining;
  }

  const onlineElapsed = Math.max(
    0,
    Math.floor((nowMs - new Date(token.lastConnectedAt).getTime()) / 1000)
  );
  return Math.max(0, baseRemaining - onlineElapsed);
}

function isTokenTimeExpired(token: HotspotTokenRow, now: Date): boolean {
  const nowMs = now.getTime();
  const remaining = computeRemainingSeconds(token, nowMs);

  if (token.status === "EXPIRED" || token.expiredAt) return true;
  if (token.expiresAt && token.expiresAt.getTime() <= nowMs) return true;
  if (token.totalSeconds > 0 && remaining <= 0) return true;

  return false;
}

/** Déconnexion forcée MikroTik + mise à jour DB (tolérant aux erreurs). */
export async function disconnectExpiredHotspotToken(
  token: HotspotTokenRow,
  options?: { activeSessionIds?: string[] }
): Promise<{ disconnected: boolean; sessionRemoved: boolean }> {
  const username = token.token;
  const customerUsername = token.assignedCustomer?.username;
  const usernames = [username, customerUsername].filter(Boolean) as string[];

  let sessionRemoved = false;

  for (const user of usernames) {
    const forceRes = await agentForceExpire(user);
    if (forceRes.ok) {
      sessionRemoved = true;
      console.log("[HOTSPOT_SESSION_REMOVED]", { token: username, user });
    } else if (!isAgentResultOffline(forceRes)) {
      console.warn("[MikroTik] force-expire", { user, error: forceRes.error });
    }

    const removeRes = await agentRemoveActive({ username: user });
    if (removeRes.ok) {
      sessionRemoved = true;
    }

    await agentDisableUser(user);
  }

  if (options?.activeSessionIds?.length) {
    for (const sessionId of options.activeSessionIds) {
      const res = await agentRemoveActive({ sessionId });
      if (res.ok) sessionRemoved = true;
    }
  }

  const now = new Date();
  await prisma.accessToken.update({
    where: { id: token.id },
    data: {
      status: "EXPIRED",
      remainingSeconds: 0,
      consumedSeconds:
        token.totalSeconds > 0 ? token.totalSeconds : token.consumedSeconds,
      isOnline: false,
      lastDisconnectedAt: now,
      expiredAt: token.expiredAt ?? now,
      expiresAt: now,
    },
  });

  if (token.assignedCustomerId) {
    await prisma.customer.update({
      where: { id: token.assignedCustomerId },
      data: { status: "EXPIRED" },
    });
  }

  await writeAuditLog({
    companyId: token.companyId,
    action: "TOKEN_EXPIRED_DISCONNECTED",
    entityType: "AccessToken",
    message: `Ticket ${username} expiré — session hotspot coupée`,
    severity: "WARN",
  });

  if (sessionRemoved) {
    await writeAuditLog({
      companyId: token.companyId,
      action: "HOTSPOT_SESSION_REMOVED",
      entityType: "AccessToken",
      message: `Session active supprimée pour ${username}`,
    });
  }

  await writeAuditLog({
    companyId: token.companyId,
    action: "CLIENT_FORCE_DISCONNECTED",
    entityType: "AccessToken",
    message: `Client déconnecté immédiatement (ticket ${username})`,
  });

  console.log("[TOKEN_EXPIRED_DISCONNECTED]", { token: username, sessionRemoved });

  return { disconnected: true, sessionRemoved };
}

function activeSessionsByUser(
  sessions: Record<string, unknown>[]
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const s of sessions) {
    const user = String(s.user ?? s.name ?? "").toLowerCase();
    if (!user) continue;
    const list = map.get(user) ?? [];
    list.push(s);
    map.set(user, list);
  }
  return map;
}

/** Vérifie et coupe tous les tickets / sessions expirés. */
export async function runExpirationEnforcer(
  companyId?: string
): Promise<ExpirationEnforcerResult> {
  const result: ExpirationEnforcerResult = {
    checked: 0,
    expired: 0,
    disconnected: 0,
    alreadyOffline: 0,
    errors: [],
    agentOffline: false,
  };

  const agentOk = await isAgentOnline();
  if (!agentOk) {
    result.agentOffline = true;
    if (isCloudRouterBlocked()) {
      return result;
    }
  }

  const now = new Date();

  const tokens = await prisma.accessToken.findMany({
    where: {
      accessType: AccessType.HOTSPOT_WIFI,
      status: { notIn: ["CANCELLED"] },
      ...(companyId ? { companyId } : {}),
    },
    include: {
      assignedCustomer: { select: { username: true } },
      plan: { select: { durationValue: true, durationUnit: true } },
    },
  });

  result.checked = tokens.length;

  let activeByUser = new Map<string, Record<string, unknown>[]>();
  if (agentOk) {
    const snap = await agentHotspotSnapshot();
    if (snap.ok) {
      activeByUser = activeSessionsByUser(
        (snap.data.activeSessions as Record<string, unknown>[]) || []
      );
    } else {
      result.errors.push(snap.error || "Snapshot agent échoué");
      result.agentOffline = isAgentResultOffline(snap);
    }
  }

  for (const raw of tokens) {
    const token = raw as HotspotTokenRow & {
      plan?: { durationValue: number; durationUnit: string };
    };

    if (token.totalSeconds <= 0 && token.plan) {
      token.totalSeconds = durationToSeconds(
        token.plan.durationValue,
        token.plan.durationUnit as never
      );
    }

    const expired = isTokenTimeExpired(token, now);
    const userKey = token.token.toLowerCase();
    const activeSessions = activeByUser.get(userKey) ?? [];
    const hasActiveSession = activeSessions.length > 0;

    const needsDisconnect =
      expired || (token.status === "EXPIRED" && hasActiveSession);

    if (!needsDisconnect) {
      if (token.status === "EXPIRED" && !hasActiveSession && !token.isOnline) {
        result.alreadyOffline += 1;
      }
      continue;
    }

    if (
      token.status === "EXPIRED" &&
      !hasActiveSession &&
      !token.isOnline &&
      token.expiredAt
    ) {
      result.alreadyOffline += 1;
      continue;
    }

    try {
        const sessionIds = activeSessions
          .map((s) => String(s[".id"] ?? ""))
          .filter(Boolean);

        await disconnectExpiredHotspotToken(token, {
          activeSessionIds: sessionIds,
        });
        result.expired += 1;
        if (sessionIds.length > 0 || token.isOnline) {
          result.disconnected += 1;
        }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`${token.token}: ${msg}`);
      console.error("[Expiration Enforcer]", token.token, msg);
    }
  }

  const expiredSubscriptions = await prisma.internetSubscription.findMany({
    where: {
      expiresAt: { lt: now },
      status: "ACTIVE",
      ...(companyId ? { companyId } : {}),
    },
    include: {
      customer: { select: { id: true, username: true, companyId: true } },
    },
    take: 50,
  });

  for (const sub of expiredSubscriptions) {
    if (!sub.customer?.username) continue;
    try {
      if (agentOk) {
        await agentForceExpire(sub.customer.username);
        await agentRemoveActive({ username: sub.customer.username });
        await agentDisableUser(sub.customer.username);
      }
      await prisma.internetSubscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" },
      });
      await prisma.customer.update({
        where: { id: sub.customerId },
        data: { status: "EXPIRED" },
      });
      result.expired += 1;
    } catch (e) {
      result.errors.push(
        `sub:${sub.id}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (result.disconnected > 0 || result.expired > 0) {
    console.log("[Expiration Enforcer] cycle", result);
  }

  return result;
}

/** Boucle serveur — 5 s par défaut. */
export function startExpirationEnforcerLoop(): void {
  if (loopTimer) return;
  if (process.env.DISABLE_EXPIRATION_ENFORCER === "true") {
    console.log("[Expiration Enforcer] désactivé (DISABLE_EXPIRATION_ENFORCER)");
    return;
  }

  console.log(
    `[Expiration Enforcer] démarré (intervalle ${ENFORCER_INTERVAL_MS}ms)`
  );

  const tick = async () => {
    if (loopRunning) return;
    loopRunning = true;
    try {
      await runExpirationEnforcer();
    } catch (e) {
      console.error(
        "[Expiration Enforcer] erreur cycle:",
        e instanceof Error ? e.message : e
      );
    } finally {
      loopRunning = false;
    }
  };

  void tick();
  loopTimer = setInterval(() => {
    void tick();
  }, ENFORCER_INTERVAL_MS);
}

export function stopExpirationEnforcerLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}
