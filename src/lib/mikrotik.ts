import { ensurePrismaConnection, prisma, withPrismaRetry } from "@/lib/prisma";
import { Router, CustomerStatus, TokenStatus } from "@prisma/client";
import { createRouterOfflineAlert } from "@/lib/alerts";
import { durationToSeconds, toMikrotikSessionTimeout } from "@/lib/time";
import { isCloudRouterBlocked, LOCAL_ROUTER_MESSAGE } from "@/lib/router-access";
import { disconnectExpiredHotspotToken } from "@/lib/mikrotik-expiration-enforcer";
import {
  AGENT_OFFLINE_MESSAGE,
  agentDisableUser,
  agentEnableUser,
  agentForceExpire,
  agentGetStatus,
  agentHotspotSnapshot,
  agentLiveStats,
  agentRemoveActive,
  agentRouterDeviceAction,
  agentSessionStatus,
  createHotspotUserOnAgent,
} from "@/lib/mikrotik-agent";

/** @deprecated Connexion directe RouterOS — réservé au mode mock dev uniquement */
type RouterOSClient = { connect(): Promise<void>; close(): Promise<void> };

type RouterConnectionInput = Pick<Router, "host" | "username" | "encryptedPassword"> & {
  apiPort?: number | null;
  networkMode?: string | null;
};

function isRouterInMockMode(router?: { networkMode?: string | null } | null): boolean {
  if (router?.networkMode === "mock") return true;
  if (router?.networkMode === "live") return false;
  return process.env.BIZANET_NETWORK_MODE === "mock";
}

class MockRouterOSClient {
  async connect() { return; }
  async close() { return; }
  async write(command: unknown) {
    const key = Array.isArray(command) ? String(command[0] ?? "") : String(command ?? "");
    if (key.includes("/ip/hotspot/active/print")) {
      return [
        {
          ".id": "*1",
          user: "BN-TEST-0001",
          address: "192.168.88.21",
          "mac-address": "AA:BB:CC:11:22:33",
          uptime: "15m",
          "bytes-in": "120000",
          "bytes-out": "340000",
        },
      ];
    }
    if (key.includes("/interface/wireless/registration-table/print")) {
      return [
        {
          ".id": "*2",
          "mac-address": "AA:BB:CC:11:22:33",
          uptime: "15m",
          "rx-byte": "120000",
          "tx-byte": "340000",
        },
      ];
    }
    if (key.includes("/ip/dhcp-server/lease/print")) {
      return [
        {
          ".id": "*3",
          address: "192.168.88.50",
          "mac-address": "44:55:66:77:88:99",
          status: "bound",
          "host-name": "Desktop-PC",
        },
      ];
    }
    if (key.includes("/ppp/active/print")) {
      return [
        {
          ".id": "*4",
          name: "pppoe-user1",
          address: "10.10.10.2",
          uptime: "1h20m",
          "caller-id": "CC:DD:EE:FF:00:11",
        },
      ];
    }
    return [];
  }
  menu() {
    const makeMenu = () => ({
      get: async () => [],
      add: async () => {},
      set: async () => {},
      remove: async () => {},
      enable: async () => {},
      disable: async () => {},
      where: () => makeMenu(),
    });
    return makeMenu();
  }
}

export type RouterLiveDevice = {
  id: string;
  sessionId: string | null;
  device: string;
  ip: string | null;
  mac: string | null;
  connectionType: "WIFI" | "ETHERNET" | "PPPOE";
  uptime: string | null;
  username: string | null;
  rxBytes: number | null;
  txBytes: number | null;
};

export type RouterLiveStats = {
  success: boolean;
  wifiClients: number;
  ethernetClients: number;
  pppoeClients: number;
  hotspotActive: number;
  devices: RouterLiveDevice[];
  errors: string[];
  localOnly?: boolean;
  message?: string;
};

export type RouterDeviceActionPayload = {
  routerId: string;
  type: "WIFI" | "ETHERNET" | "PPPOE";
  user?: string | null;
  mac?: string | null;
  ip?: string | null;
  sessionId?: string | null;
};

const ROUTER_LIVE_STATS_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

async function readRouterPathSafe(
  client: RouterOSClient | MockRouterOSClient,
  path: string,
  errors: string[]
): Promise<any[]> {
  const printCmd = `${path}/print`;
  try {
    const c: any = client as any;
    const routerWrite = async () => {
      if (typeof c?.write === "function") {
        try {
          return await c.write(printCmd);
        } catch {
          return await c.write([printCmd]);
        }
      }

      if (c?.rosApi && typeof c.rosApi.write === "function") {
        try {
          return await c.rosApi.write(printCmd);
        } catch {
          return await c.rosApi.write([printCmd]);
        }
      }

      if (c?.rosApi && typeof c.rosApi.menu === "function") {
        const menuPath = path.replaceAll("/", " ").trim();
        return await c.rosApi.menu(menuPath).get();
      }

      throw new Error("RouterOS client has no write/menu/rosApi methods");
    };

    const data = await withTimeout(routerWrite(), ROUTER_LIVE_STATS_TIMEOUT_MS, printCmd);
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    const message = `${path}: ${e?.message || "read failed"}`;
    errors.push(message);
    console.error("[Router Live Stats Partial Error]", message);
    return [];
  }
}

function menuPathFromSlashPath(path: string): string {
  return `/${path.replace(/^\//, "").replace(/\//g, " ")}`;
}

function getRouterMenu(client: RouterOSClient | MockRouterOSClient, slashPath: string): any | null {
  const c: any = client as any;
  const menuPath = menuPathFromSlashPath(slashPath);
  if (typeof c?.menu === "function") return c.menu(menuPath);
  if (c?.rosApi && typeof c.rosApi.menu === "function") {
    return c.rosApi.menu(slashPath.replace(/^\//, "").replace(/\//g, " "));
  }
  return null;
}

async function executeRosCommand(
  client: RouterOSClient | MockRouterOSClient,
  command: string,
  args: string[] = []
): Promise<unknown> {
  const c: any = client as any;
  const candidates: unknown[] = [[command, ...args], command];

  if (typeof c?.write === "function") {
    for (const payload of candidates) {
      try {
        return await c.write(payload);
      } catch {}
    }
  }
  if (c?.rosApi && typeof c.rosApi.write === "function") {
    for (const payload of candidates) {
      try {
        return await c.rosApi.write(payload);
      } catch {}
    }
  }
  throw new Error("RouterOS client has no write/menu/rosApi methods");
}

async function removeSessionsByUser(
  client: RouterOSClient | MockRouterOSClient,
  path: "/ip/hotspot/active" | "/ppp/active",
  userField: "user" | "name",
  user: string
): Promise<number> {
  const sessions = await readRouterPathSafe(client, path, []);
  const matched = sessions.filter((s: any) => String(s[userField] ?? "") === user);
  let removed = 0;
  for (const s of matched) {
    const sid = String(s[".id"] ?? "").trim();
    if (!sid) continue;
    try {
      await executeRosCommand(client, `${path}/remove`, [`=.id=${sid}`]);
      removed += 1;
    } catch {
      try {
        await executeRosCommand(client, `${path}/remove`, [`=numbers=${sid}`]);
        removed += 1;
      } catch {}
    }
  }
  return removed;
}

/** Mode mock uniquement — en production locale tout passe par BizaNet-Agent. */
export async function connectRouter(router: RouterConnectionInput) {
  if (isRouterInMockMode(router)) {
    await new Promise((res) => setTimeout(res, 500));
    return new MockRouterOSClient();
  }
  throw new Error(AGENT_OFFLINE_MESSAGE);
}

function shouldUseAgent(router?: { networkMode?: string | null } | null): boolean {
  return !isRouterInMockMode(router);
}

export type HotspotUserStatus = {
  connected: boolean;
  address: string | null;
  uptime: string | null;
  bytesIn: number;
  bytesOut: number;
};

export type HotspotSyncResult = {
  checked: number;
  started: number;
  expired: number;
  active: number;
  unused: number;
};

function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

const HOTSPOT_SESSION_POLL_ATTEMPTS = 8;
const HOTSPOT_SESSION_POLL_INTERVAL_MS = 2000;

function parseRouterOSBytes(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseHotspotSession(session: Record<string, unknown>): HotspotUserStatus {
  return {
    connected: true,
    address: typeof session.address === "string" ? session.address : null,
    uptime: typeof session.uptime === "string" ? session.uptime : null,
    bytesIn: parseRouterOSBytes(session["bytes-in"]),
    bytesOut: parseRouterOSBytes(session["bytes-out"]),
  };
}

function emptyHotspotUserStatus(): HotspotUserStatus {
  return {
    connected: false,
    address: null,
    uptime: null,
    bytesIn: 0,
    bytesOut: 0,
  };
}

async function getHotspotActiveSessionsForUser(
  client: RouterOSClient | MockRouterOSClient,
  username: string
): Promise<Record<string, unknown>[]> {
  const activeMenu = (client as any).menu("/ip hotspot active");
  return activeMenu.where("user", username).get();
}

async function getHotspotUserStatusFromClient(
  client: RouterOSClient | MockRouterOSClient,
  username: string,
  router?: { networkMode?: string | null } | null
): Promise<HotspotUserStatus> {
  if (shouldUseAgent(router)) {
    const res = await agentSessionStatus(username);
    if (!res.ok) {
      throw new Error(res.error || AGENT_OFFLINE_MESSAGE);
    }
    const d = res.data;
    if (d.connected) {
      return {
        connected: true,
        address: d.address ?? null,
        uptime: d.uptime ?? null,
        bytesIn: d.bytesIn ?? 0,
        bytesOut: d.bytesOut ?? 0,
      };
    }
    return emptyHotspotUserStatus();
  }

  if (isRouterInMockMode(router)) {
    const mockConnected = process.env.BIZANET_MOCK_HOTSPOT_CONNECTED === "true";
    if (mockConnected) {
      console.log("[MikroTik SESSION FOUND]", { username, mock: true });
      return {
        connected: true,
        address: "192.168.88.100",
        uptime: "5m",
        bytesIn: 1024,
        bytesOut: 4096,
      };
    }
    console.log("[MikroTik SESSION NOT FOUND]", { username, mock: true });
    return emptyHotspotUserStatus();
  }

  const sessions = await getHotspotActiveSessionsForUser(client, username);
  if (sessions.length === 0) {
    console.log("[MikroTik SESSION NOT FOUND]", { username });
    return emptyHotspotUserStatus();
  }

  const status = parseHotspotSession(sessions[0] as Record<string, unknown>);
  console.log("[MikroTik SESSION FOUND]", { username, address: status.address, uptime: status.uptime });
  return status;
}

async function isHotspotUserDisabled(
  client: RouterOSClient | MockRouterOSClient,
  username: string,
  router?: { networkMode?: string | null } | null
): Promise<boolean> {
  if (shouldUseAgent(router)) {
    const res = await agentSessionStatus(username);
    if (!res.ok) return false;
    return Boolean(res.data.disabled);
  }

  if (isRouterInMockMode(router)) {
    return process.env.BIZANET_MOCK_HOTSPOT_DISABLED === "true";
  }

  const userMenu = (client as any).menu("/ip hotspot user");
  const users = await userMenu.where("name", username).get();
  if (users.length === 0) return false;
  const disabled = users[0].disabled;
  return disabled === true || disabled === "true" || disabled === "yes";
}

async function waitForHotspotSession(
  client: RouterOSClient | MockRouterOSClient,
  username: string,
  router?: { networkMode?: string | null } | null,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? HOTSPOT_SESSION_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? HOTSPOT_SESSION_POLL_INTERVAL_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log("[MikroTik ACTIVE CHECK]", { username, attempt, maxAttempts });
    if (shouldUseAgent(router)) {
      const res = await agentSessionStatus(username);
      if (res.ok && res.data.connected) return true;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      continue;
    }
    const status = await getHotspotUserStatusFromClient(client, username, router);
    if (status.connected) return true;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

function resolveOfflineCustomerStatus(input: {
  disabled: boolean;
  expiresAt: Date | null | undefined;
}): CustomerStatus {
  const now = new Date();
  if (input.disabled) return "SUSPENDED";
  if (input.expiresAt && input.expiresAt < now) return "EXPIRED";
  return "PENDING";
}

async function syncHotspotStatusWithClient(
  client: RouterOSClient | MockRouterOSClient,
  customer: {
    id: string;
    username: string;
    companyId: string;
    expiresAt: Date | null;
    router: { networkMode?: string | null } | null;
  },
  activeSubscriptionExpiresAt?: Date | null
): Promise<CustomerStatus> {
  console.log("[MikroTik ACTIVE CHECK]", { customerId: customer.id, username: customer.username });

  const sessionStatus = await getHotspotUserStatusFromClient(
    client,
    customer.username,
    customer.router
  );
  const disabled = await isHotspotUserDisabled(client, customer.username, customer.router);
  const expiresAt = customer.expiresAt ?? activeSubscriptionExpiresAt ?? null;

  const newStatus: CustomerStatus = sessionStatus.connected
    ? "ACTIVE"
    : resolveOfflineCustomerStatus({ disabled, expiresAt });

  await ensurePrismaConnection();
  await withPrismaRetry(() =>
    prisma.customer.update({
      where: { id: customer.id },
      data: { status: newStatus },
    })
  );

  return newStatus;
}

/** Lit la session hotspot active pour un username (temps réel MikroTik). */
export async function getHotspotUserStatus(
  username: string,
  routerInput: RouterConnectionInput & { networkMode?: string | null }
): Promise<HotspotUserStatus> {
  if (shouldUseAgent(routerInput)) {
    return getHotspotUserStatusFromClient({} as MockRouterOSClient, username, routerInput);
  }
  const client = await connectRouter(routerInput);
  try {
    return getHotspotUserStatusFromClient(client, username, routerInput);
  } finally {
    client.close();
  }
}

/** Synchronise le statut client avec /ip hotspot active et l'état du user hotspot. */
export async function syncHotspotStatus(customerId: string): Promise<CustomerStatus> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      router: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { expiresAt: "desc" },
        take: 1,
      },
    },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");

  const client = shouldUseAgent(customer.router)
    ? ({} as MockRouterOSClient)
    : await connectRouter(customer.router);
  try {
    return syncHotspotStatusWithClient(
      client,
      customer,
      customer.subscriptions[0]?.expiresAt
    );
  } finally {
    if (!shouldUseAgent(customer.router)) {
      client.close();
    }
  }
}

function resolveTokenStatusFromMikrotik(input: {
  dbStatus: TokenStatus;
  connected: boolean;
  disabled: boolean;
  expiresAt: Date | null | undefined;
  assignedCustomerId: string | null;
  activatedAt: Date | null;
}): TokenStatus {
  if (input.dbStatus === "CANCELLED") return "CANCELLED";

  const now = new Date();
  if (input.expiresAt && input.expiresAt < now) return "EXPIRED";

  if (input.connected) return "ACTIVE";
  if (input.disabled) return "SUSPENDED" as TokenStatus;

  // Jamais connecté au hotspot : token non activé OU activé mais aucune session encore
  if (!input.assignedCustomerId && input.dbStatus === "UNUSED") return "UNUSED";
  if (!input.activatedAt && input.dbStatus === "UNUSED") return "UNUSED";
  if (!input.connected && !input.activatedAt) return "UNUSED";

  // Token activé (portail) mais pas encore connecté au WiFi
  if (input.assignedCustomerId && !input.connected && !input.disabled) {
    return input.dbStatus === "UNUSED" ? "UNUSED" : "USED";
  }

  return input.dbStatus;
}

/** Synchronise le statut d'un access token avec MikroTik hotspot. */
export async function syncTokenHotspotStatus(accessTokenId: string): Promise<TokenStatus> {
  const accessToken = await prisma.accessToken.findUnique({
    where: { id: accessTokenId },
    include: {
      assignedCustomer: true,
      router: true,
    },
  });

  if (!accessToken) throw new Error("Token introuvable");
  if (accessToken.accessType !== "HOTSPOT_WIFI") return accessToken.status;

  const router =
    accessToken.router ??
    (accessToken.assignedCustomer?.routerId
      ? await prisma.router.findUnique({
          where: { id: accessToken.assignedCustomer!.routerId! },
        })
      : null);

  if (!router) return accessToken.status;

  const username = accessToken.token;
  const client = shouldUseAgent(router)
    ? ({} as MockRouterOSClient)
    : await connectRouter(router);
  try {
    const sessionStatus = await getHotspotUserStatusFromClient(client, username, router);
    const disabled = await isHotspotUserDisabled(client, username, router);
    const expiresAt =
      accessToken.expiresAt ?? accessToken.assignedCustomer?.expiresAt ?? null;

    const newStatus = resolveTokenStatusFromMikrotik({
      dbStatus: accessToken.status,
      connected: sessionStatus.connected,
      disabled,
      expiresAt,
      assignedCustomerId: accessToken.assignedCustomerId,
      activatedAt: accessToken.activatedAt,
    });

    if (newStatus !== accessToken.status) {
      await prisma.accessToken.update({
        where: { id: accessToken.id },
        data: {
          status: newStatus,
          ...(sessionStatus.connected && !accessToken.activatedAt
            ? { activatedAt: new Date(), usedAt: new Date() }
            : {}),
        },
      });
    } else if (sessionStatus.connected && !accessToken.activatedAt) {
      await prisma.accessToken.update({
        where: { id: accessToken.id },
        data: { activatedAt: new Date(), usedAt: new Date() },
      });
    }

    return newStatus;
  } finally {
    if (!shouldUseAgent(router)) {
      client.close();
    }
  }
}

/** Synchronise tous les tokens hotspot d'un routeur (lecture unique de /ip hotspot active). */
export async function syncRouterTokenStatuses(routerId: string): Promise<void> {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      host: true,
      username: true,
      encryptedPassword: true,
      apiPort: true,
      networkMode: true,
    },
  });
  if (!router) return;

  const tokens = await prisma.accessToken.findMany({
    where: {
      routerId,
      accessType: "HOTSPOT_WIFI",
      status: { not: "CANCELLED" },
    },
    include: { assignedCustomer: true },
  });

  if (tokens.length === 0) return;

  const client = isRouterInMockMode(router)
    ? await connectRouter(router)
    : ({} as MockRouterOSClient);
  try {
    let activeSessions: Record<string, unknown>[] = [];
    if (shouldUseAgent(router)) {
      const snap = await agentHotspotSnapshot();
      if (!snap.ok) return;
      activeSessions = (snap.data.activeSessions as Record<string, unknown>[]) || [];
    } else if (isRouterInMockMode(router)) {
      if (process.env.BIZANET_MOCK_HOTSPOT_CONNECTED === "true") {
        activeSessions = tokens.map((t) => ({
          user: t.token,
          address: "192.168.88.100",
          uptime: "5m",
          "bytes-in": "1024",
          "bytes-out": "4096",
        }));
      }
    } else {
      const activeMenu = (client as any).menu("/ip hotspot active");
      activeSessions = await activeMenu.get();
    }

    const sessionByUser = new Map(
      activeSessions.map((s) => [String(s.user ?? "").toLowerCase(), s])
    );

    const disabledByUser = new Map<string, boolean>();
    if (shouldUseAgent(router)) {
      const snapUsers = await agentHotspotSnapshot();
      if (snapUsers.ok) {
        for (const u of snapUsers.data.users || []) {
          disabledByUser.set(String(u.name ?? "").toLowerCase(), Boolean(u.disabled));
        }
      }
    } else if (!isRouterInMockMode(router)) {
      const userMenu = (client as any).menu("/ip hotspot user");
      const hotspotUsers = await userMenu.get();
      for (const u of hotspotUsers) {
        const name = String(u.name ?? "").toLowerCase();
        const disabled = u.disabled;
        disabledByUser.set(
          name,
          disabled === true || disabled === "true" || disabled === "yes"
        );
      }
    } else if (process.env.BIZANET_MOCK_HOTSPOT_DISABLED === "true") {
      for (const token of tokens) {
        disabledByUser.set(token.token.toLowerCase(), true);
      }
    }

    for (const token of tokens) {
      const username = token.token;
      const session = sessionByUser.get(username.toLowerCase());
      const connected = Boolean(session);
      const disabled = disabledByUser.get(username.toLowerCase()) ?? false;
      const expiresAt = token.expiresAt ?? token.assignedCustomer?.expiresAt ?? null;

      const newStatus = resolveTokenStatusFromMikrotik({
        dbStatus: token.status,
        connected,
        disabled,
        expiresAt,
        assignedCustomerId: token.assignedCustomerId,
        activatedAt: token.activatedAt,
      });

      if (newStatus !== token.status) {
        await prisma.accessToken.update({
          where: { id: token.id },
          data: {
            status: newStatus,
            ...(connected && !token.activatedAt
              ? { activatedAt: new Date(), usedAt: new Date() }
              : {}),
          },
        });
      }
    }
  } finally {
    if (isRouterInMockMode(router)) {
      client.close();
    }
  }
}

async function forceExpireHotspotToken(
  client: RouterOSClient | MockRouterOSClient,
  token: {
    id: string;
    token: string;
    companyId?: string;
    assignedCustomerId: string | null;
    totalSeconds?: number;
    remainingSeconds?: number;
    consumedSeconds?: number;
    isOnline?: boolean;
    lastConnectedAt?: Date | null;
    expiredAt?: Date | null;
    status?: TokenStatus;
  },
  router?: { networkMode?: string | null } | null
): Promise<void> {
  if (shouldUseAgent(router)) {
    await disconnectExpiredHotspotToken({
      id: token.id,
      token: token.token,
      companyId: token.companyId ?? "",
      status: token.status ?? "USED",
      accessType: "HOTSPOT_WIFI",
      routerId: null,
      assignedCustomerId: token.assignedCustomerId,
      totalSeconds: token.totalSeconds ?? 0,
      remainingSeconds: token.remainingSeconds ?? 0,
      consumedSeconds: token.consumedSeconds ?? 0,
      isOnline: token.isOnline ?? false,
      activatedAt: null,
      lastConnectedAt: token.lastConnectedAt ?? null,
      expiresAt: null,
      expiredAt: token.expiredAt ?? null,
    });
    return;
  }

  const userMenu = (client as any).menu("/ip hotspot user");
  const activeMenu = (client as any).menu("/ip hotspot active");
  const hostMenu = (client as any).menu("/ip hotspot host");

  const users = await userMenu.where("name", token.token).get();
  if (users.length > 0) {
    await userMenu.where("name", token.token).disable();
    console.log("[MikroTik User Disabled]", { token: token.token });
  }

  const sessions = await activeMenu.where("user", token.token).get();
  for (const session of sessions) {
    const mac = session["mac-address"];
    if (mac) {
      const hosts = await hostMenu.where("mac-address", mac).get();
      for (const h of hosts) {
        if (h[".id"]) await hostMenu.remove(h[".id"]);
      }
    }
    if (session[".id"]) {
      await activeMenu.remove(session[".id"]);
      console.log("[HOTSPOT_SESSION_REMOVED]", {
        token: token.token,
        sessionId: session[".id"],
      });
    }
  }

  const now = new Date();
  await prisma.accessToken.update({
    where: { id: token.id },
    data: {
      status: "EXPIRED",
      remainingSeconds: 0,
      consumedSeconds: token.totalSeconds ?? undefined,
      isOnline: false,
      lastDisconnectedAt: now,
      expiredAt: now,
      expiresAt: now,
    } as any,
  });

  if (token.assignedCustomerId) {
    await prisma.customer.update({
      where: { id: token.assignedCustomerId },
      data: { status: "EXPIRED" },
    });
  }

  console.log("[TOKEN_EXPIRED_DISCONNECTED]", { token: token.token });
}

/**
 * Synchronise les tickets hotspot avec l'etat reel MikroTik.
 * - Demarre le timer a la premiere session active
 * - Expire automatiquement et coupe l'acces quand le temps est fini
 */
/** Sync hotspot autorisé via agent tunnel même en cloud Vercel. */
export function canRunHotspotSync(): boolean {
  if (!isCloudRouterBlocked()) return true;
  const agentUrl = process.env.BIZANET_AGENT_URL?.trim() || "";
  return Boolean(agentUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(agentUrl));
}

export async function syncHotspotSessions(companyId?: string): Promise<HotspotSyncResult> {
  if (!canRunHotspotSync()) {
    return { checked: 0, started: 0, expired: 0, active: 0, unused: 0 };
  }

  try {
    const { runExpirationEnforcer } = await import("@/lib/mikrotik-expiration-enforcer");
    await runExpirationEnforcer(companyId);
  } catch (e) {
    console.error("[Hotspot Sync] pre-enforcer", e);
  }

  const tokens = await prisma.accessToken.findMany({
    where: {
      accessType: "HOTSPOT_WIFI",
      status: { not: "CANCELLED" },
      ...(companyId ? { companyId } : {}),
    },
    include: {
      plan: true,
      assignedCustomer: true,
      router: true,
    },
  });

  const result: HotspotSyncResult = {
    checked: tokens.length,
    started: 0,
    expired: 0,
    active: 0,
    unused: 0,
  };

  if (tokens.length === 0) return result;

  const routerIds = [...new Set(tokens.map((t) => t.routerId).filter(Boolean))] as string[];
  const routerMap = new Map<string, RouterConnectionInput & { id: string; networkMode?: string | null }>();

  if (routerIds.length > 0) {
    const routers = await prisma.router.findMany({
      where: { id: { in: routerIds } },
      select: {
        id: true,
        host: true,
        username: true,
        encryptedPassword: true,
        apiPort: true,
        networkMode: true,
      },
    });
    for (const r of routers) routerMap.set(r.id, r);
  }

  const tokensByRouter = new Map<string, typeof tokens>();
  for (const token of tokens) {
    if (!token.routerId) continue;
    const bucket = tokensByRouter.get(token.routerId) ?? [];
    bucket.push(token);
    tokensByRouter.set(token.routerId, bucket);
  }

  console.log("[Hotspot Sync]", {
    companyId: companyId ?? "ALL",
    routers: tokensByRouter.size,
    tickets: tokens.length,
  });

  for (const [routerId, routerTokens] of tokensByRouter) {
    const router = routerMap.get(routerId);
    if (!router) continue;

    const client = isRouterInMockMode(router)
      ? await connectRouter(router)
      : ({} as MockRouterOSClient);
    try {
      let activeSessions: Record<string, unknown>[] = [];
      let disabledByUser = new Map<string, boolean>();

      if (shouldUseAgent(router)) {
        const snap = await agentHotspotSnapshot();
        if (!snap.ok) {
          console.error("[Hotspot Sync] agent snapshot failed:", snap.error);
          continue;
        }
        activeSessions = (snap.data.activeSessions as Record<string, unknown>[]) || [];
        disabledByUser = new Map(
          (snap.data.users || []).map((u) => [
            String(u.name ?? "").toLowerCase(),
            Boolean(u.disabled),
          ])
        );
      } else if (isRouterInMockMode(router)) {
        if (process.env.BIZANET_MOCK_HOTSPOT_CONNECTED === "true") {
          activeSessions = routerTokens.map((t) => ({
            user: t.token,
            address: "192.168.88.100",
            uptime: "5m",
            "bytes-in": "1024",
            "bytes-out": "4096",
          }));
        }
        if (process.env.BIZANET_MOCK_HOTSPOT_DISABLED === "true") {
          for (const token of routerTokens) {
            disabledByUser.set(token.token.toLowerCase(), true);
          }
        }
      }

      const sessionByUser = new Map<string, Record<string, unknown>>();
      for (const s of activeSessions) {
        const idents = [normalizeIdentity((s as any).user), normalizeIdentity((s as any).name)];
        for (const ident of idents) {
          if (ident) sessionByUser.set(ident, s as Record<string, unknown>);
        }
      }

      for (const token of routerTokens) {
        const tokenAny = token as any;
        const tokenUsername = normalizeIdentity(token.token);
        const customerUsername = normalizeIdentity((token as any).assignedCustomer?.username);
        const linkedUsername = normalizeIdentity((token as any).username);
        const identities = [tokenUsername, customerUsername, linkedUsername].filter(Boolean) as string[];

        let session: Record<string, unknown> | undefined;
        for (const ident of identities) {
          session = sessionByUser.get(ident);
          if (session) {
            console.log("[Token Active Match]", {
              token: token.token,
              identity: ident,
              sessionUser: (session as any).user ?? (session as any).name ?? null,
            });
            break;
          }
        }
        const connected = Boolean(session);
        const disabled = identities.some((ident) => disabledByUser.get(ident) === true);

        const now = new Date();
        const totalSeconds =
          tokenAny.totalSeconds && tokenAny.totalSeconds > 0
            ? tokenAny.totalSeconds
            : durationToSeconds(token.plan.durationValue, token.plan.durationUnit);

        let consumedSeconds = tokenAny.consumedSeconds ?? 0;
        let remainingSeconds =
          tokenAny.remainingSeconds && tokenAny.remainingSeconds > 0
            ? tokenAny.remainingSeconds
            : Math.max(0, totalSeconds - consumedSeconds);
        let lastConnectedAt = tokenAny.lastConnectedAt as Date | null | undefined;
        let becameOnline = false;
        let becameOffline = false;

        const hardExpired =
          token.status === "EXPIRED" ||
          Boolean(tokenAny.expiredAt) ||
          (totalSeconds > 0 && remainingSeconds <= 0);
        if (hardExpired) {
          if (connected || !disabled || tokenAny.isOnline || remainingSeconds > 0) {
            await forceExpireHotspotToken(client, { ...token, totalSeconds }, router);
          }
          continue;
        }

        if (connected) {
          if (!tokenAny.isOnline) {
            lastConnectedAt = now;
            becameOnline = true;
            console.log("[Hotspot Online]", { token: token.token, at: now });
            if (!tokenAny.activatedAt) {
              console.log("[Token Timer Started]", { token: token.token, at: now });
            }
          }

          const refConnectedAt = lastConnectedAt ?? token.activatedAt ?? now;
          const sessionElapsed = Math.max(
            0,
            Math.floor((now.getTime() - refConnectedAt.getTime()) / 1000)
          );

          const projectedConsumed = Math.min(totalSeconds, consumedSeconds + sessionElapsed);
          const projectedRemaining = Math.max(0, totalSeconds - projectedConsumed);

          console.log("[Time Consumed]", {
            token: token.token,
            consumedSeconds: projectedConsumed,
            remainingSeconds: projectedRemaining,
          });

          if (projectedRemaining <= 0) {
            await forceExpireHotspotToken(client, { ...token, totalSeconds }, router);
            result.expired += 1;
            continue;
          }

          await prisma.accessToken.update({
            where: { id: token.id },
            data: {
              status: "USED",
              activatedAt: token.activatedAt ?? now,
              usedAt: token.usedAt ?? now,
              totalSeconds,
              consumedSeconds,
              remainingSeconds: projectedRemaining,
              isOnline: true,
              lastConnectedAt: refConnectedAt,
              expiresAt: new Date(now.getTime() + projectedRemaining * 1000),
              expiredAt: null,
            } as any,
          });

          if (token.assignedCustomerId) {
            await prisma.customer.update({
              where: { id: token.assignedCustomerId },
              data: { status: "ACTIVE" },
            });
          }

          if (becameOnline && !tokenAny.activatedAt) {
            result.started += 1;
            console.log("[Token Started]", { token: token.token, startedAt: now });
          }
          result.active += 1;
          continue;
        }

        if (tokenAny.isOnline) {
          const refConnectedAt = tokenAny.lastConnectedAt ?? tokenAny.activatedAt ?? now;
          const elapsed = Math.max(
            0,
            Math.floor((now.getTime() - refConnectedAt.getTime()) / 1000)
          );
          consumedSeconds = Math.min(totalSeconds, consumedSeconds + elapsed);
          remainingSeconds = Math.max(0, totalSeconds - consumedSeconds);
          becameOffline = true;
          console.log("[Hotspot Offline]", { token: token.token, at: now });
          console.log("[Time Paused]", {
            token: token.token,
            consumedSeconds,
            remainingSeconds,
          });
        }

        if (remainingSeconds <= 0) {
          await forceExpireHotspotToken(client, { ...token, totalSeconds }, router);
          result.expired += 1;
          continue;
        }

        if (disabled) {
          if (token.status !== ("SUSPENDED" as TokenStatus)) {
            await prisma.accessToken.update({
              where: { id: token.id },
              data: {
                status: "SUSPENDED" as TokenStatus,
                isOnline: false,
                totalSeconds,
                consumedSeconds,
                remainingSeconds,
                ...(becameOffline ? { lastDisconnectedAt: now } : {}),
              } as any,
            });
          }
          continue;
        }

        const started = Boolean(tokenAny.activatedAt || tokenAny.firstActivatedAt);
        const offlineStatus = started ? "USED" : "UNUSED";
        await prisma.accessToken.update({
          where: { id: token.id },
          data: {
            status: offlineStatus,
            isOnline: false,
            totalSeconds,
            consumedSeconds,
            remainingSeconds,
            ...(becameOffline ? { lastDisconnectedAt: now } : {}),
          } as any,
        });

        if (started) {
          if (token.assignedCustomerId) {
            await prisma.customer.update({
              where: { id: token.assignedCustomerId },
              data: { status: "PENDING" },
            });
          }
        } else {
          result.unused += 1;
        }
      }
    } finally {
      if (isRouterInMockMode(router)) {
        client.close();
      }
    }
  }

  return result;
}

// Helper to create a NetworkJob on failure
async function handleMikroTikFailure(
  action: "ACTIVATE" | "SUSPEND" | "CREATE_USER" | "TEST_ROUTER",
  routerId: string,
  companyId: string,
  customerId: string | null,
  error: any
) {
  console.error(`MikroTik action ${action} failed:`, error.message);
  
  if (action === "TEST_ROUTER") return; // Tests are handled manually

  await ensurePrismaConnection();
  await withPrismaRetry(() =>
    prisma.networkJob.create({
      data: {
        action,
        companyId,
        routerId,
        customerId,
        status: "PENDING",
        lastError: error.message,
      },
    })
  );
}

export async function testRouterConnection(routerId: string) {
  if (isCloudRouterBlocked()) {
    return {
      success: false as const,
      localOnly: true as const,
      message: LOCAL_ROUTER_MESSAGE,
      router: null,
    };
  }

  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
      networkMode: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  if (shouldUseAgent(router)) {
    const agentRes = await agentGetStatus();
    const now = new Date();
    if (agentRes.ok) {
      const updated = await prisma.router.update({
        where: { id: routerId },
        data: { status: "ONLINE", lastError: null, lastSeenAt: now },
        select: {
          id: true,
          companyId: true,
          name: true,
          host: true,
          username: true,
          status: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return {
        success: true,
        router: updated,
        message: "MikroTik connecté via BizaNet-Agent.",
      };
    }
    const errMsg = agentRes.agentOffline
      ? AGENT_OFFLINE_MESSAGE
      : agentRes.error || "Agent injoignable";
    const updated = await prisma.router.update({
      where: { id: routerId },
      data: { status: "OFFLINE", lastError: errMsg },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: false,
      router: updated,
      message: errMsg,
    };
  }

  try {
    const client = await connectRouter(router);
    await client.close();
    const now = new Date();

    const updated = await prisma.router.update({
      where: { id: routerId },
      data: { status: "ONLINE", lastError: null, lastSeenAt: now },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      router: updated,
      message: "MikroTik connecté avec succès.",
    };
  } catch (error: any) {
    const updated = await prisma.router.update({
      where: { id: routerId },
      data: { status: "OFFLINE", lastError: error.message },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createRouterOfflineAlert(router, error.message);

    return {
      success: false,
      router: updated,
      message: "Impossible de joindre MikroTik. Vérifiez IP, port, username, password et accès API.",
    };
  }
}

export async function createHotspotUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");
  if (!customer.subscriptions || customer.subscriptions.length === 0) throw new Error("Aucune souscription active trouvée");

  const plan = customer.subscriptions[0].plan;
  const profileName = `bizanet-${plan.id}`;
  const sessionTimeout = toMikrotikSessionTimeout(plan.durationValue, plan.durationUnit);

  if (shouldUseAgent(customer.router)) {
    const agentRes = await createHotspotUserOnAgent(
      {
        username: customer.username,
        password: customer.password,
        profile: profileName,
        comment: `bizanet-customer-${customer.id}`,
        limitUptime: sessionTimeout,
      },
      `customer:${customer.id}`
    );
    if (!agentRes.ok) {
      const err = new Error(agentRes.error || AGENT_OFFLINE_MESSAGE);
      await handleMikroTikFailure("CREATE_USER", customer.router.id, customer.companyId, customer.id, err);
      throw err;
    }
    return;
  }

  const client = await connectRouter(customer.router);
  const profileData = {
    name: profileName,
    "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
    "shared-users": "1",
    "session-timeout": sessionTimeout,
    "idle-timeout": "none",
    "keepalive-timeout": "2m",
    "status-autorefresh": "1m",
  };

  try {
    const profileMenu = (client as any).menu("/ip hotspot user profile");
    const profiles = await profileMenu.where("name", profileName).get();
    if (profiles.length === 0) {
      await profileMenu.add(profileData);
    } else {
      await profileMenu.where("name", profileName).set(profileData);
    }

    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length === 0) {
      await userMenu.add({
        name: customer.username,
        password: customer.password,
        profile: profileName,
      });
    } else {
      await userMenu.where("name", customer.username).set({
        password: customer.password,
        profile: profileName,
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("CREATE_USER", customer.router.id, customer.companyId, customer.id, error);
    throw error;
  } finally {
    client.close();
  }
}

export async function activateUser(
  customerId: string
): Promise<{ status: CustomerStatus; connected: boolean }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      router: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { expiresAt: "desc" },
        take: 1,
      },
    },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");

  const mockClient = {} as MockRouterOSClient;

  if (shouldUseAgent(customer.router)) {
    try {
      const enableRes = await agentEnableUser(customer.username);
      if (!enableRes.ok) {
        throw new Error(enableRes.error || `Utilisateur ${customer.username} introuvable sur MikroTik`);
      }
      await agentRemoveActive({ username: customer.username });
      await waitForHotspotSession(mockClient, customer.username, customer.router);
      await ensurePrismaConnection();
      const status = await syncHotspotStatusWithClient(
        mockClient,
        customer,
        customer.subscriptions[0]?.expiresAt
      );
      return { status, connected: status === "ACTIVE" };
    } catch (error: any) {
      await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
      const status = await syncHotspotStatusWithClient(
        mockClient,
        customer,
        customer.subscriptions[0]?.expiresAt
      ).catch(() => "PENDING" as CustomerStatus);
      await ensurePrismaConnection();
      await withPrismaRetry(() =>
        prisma.customer.update({
          where: { id: customerId },
          data: { status: status === "ACTIVE" ? "PENDING" : status },
        })
      );
      return { status: status === "ACTIVE" ? "PENDING" : status, connected: false };
    }
  }

  const client = await connectRouter(customer.router);
  try {
    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length > 0) {
      await userMenu.where("name", customer.username).enable();
    } else {
      throw new Error(`Utilisateur ${customer.username} introuvable sur le routeur`);
    }

    const activeMenu = (client as any).menu("/ip hotspot active");
    const activeSessions = await activeMenu.where("user", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }

    await waitForHotspotSession(client, customer.username, customer.router);
    await ensurePrismaConnection();

    const status = await syncHotspotStatusWithClient(
      client,
      customer,
      customer.subscriptions[0]?.expiresAt
    );
    const connected = status === "ACTIVE";

    return { status, connected };
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
    const status = await syncHotspotStatusWithClient(
      client,
      customer,
      customer.subscriptions[0]?.expiresAt
    ).catch(() => "PENDING" as CustomerStatus);

    await ensurePrismaConnection();
    await withPrismaRetry(() =>
      prisma.customer.update({
        where: { id: customerId },
        data: { status: status === "ACTIVE" ? "PENDING" : status },
      })
    );

    return { status: status === "ACTIVE" ? "PENDING" : status, connected: false };
  } finally {
    client.close();
  }
}

export async function disconnectUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");

  if (shouldUseAgent(customer.router)) {
    const res = await agentRemoveActive({ username: customer.username });
    if (!res.ok) {
      console.error("Error disconnecting via agent:", res.error);
      throw new Error(res.error || AGENT_OFFLINE_MESSAGE);
    }
  } else {
    const client = await connectRouter(customer.router);
    try {
      const activeMenu = (client as any).menu("/ip hotspot active");
      const activeSessions = await activeMenu.where("user", customer.username).get();
      for (const session of activeSessions) {
        if (session[".id"]) {
          await activeMenu.remove(session[".id"]);
        }
      }
    } catch (error: any) {
      console.error("Error disconnecting MikroTik user:", error);
      throw error;
    } finally {
      client.close();
    }
  }

  await syncHotspotStatus(customerId).catch((err) =>
    console.error("syncHotspotStatus after disconnect:", err)
  );
}

export async function suspendUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) return;

  try {
    if (shouldUseAgent(customer.router)) {
      const res = await agentDisableUser(customer.username);
      if (!res.ok) throw new Error(res.error || AGENT_OFFLINE_MESSAGE);
      await agentRemoveActive({ username: customer.username });
    } else {
      const client = await connectRouter(customer.router);
      try {
        const userMenu = (client as any).menu("/ip hotspot user");
        const users = await userMenu.where("name", customer.username).get();
        if (users.length > 0) {
          await userMenu.where("name", customer.username).disable();
        }
        const activeMenu = (client as any).menu("/ip hotspot active");
        const activeSessions = await activeMenu.where("user", customer.username).get();
        for (const session of activeSessions) {
          if (session[".id"]) {
            await activeMenu.remove(session[".id"]);
          }
        }
      } finally {
        client.close();
      }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { status: "SUSPENDED" },
    });
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
    console.error("Error suspending MikroTik user:", error);
  }
}

export async function deleteUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length > 0 && users[0][".id"]) {
      await userMenu.remove(users[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting MikroTik user:", error);
  } finally {
    client.close();
  }
}

export async function getActiveUsers(routerId: string) {
  if (isCloudRouterBlocked()) {
    return [];
  }

  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
      networkMode: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  if (shouldUseAgent(router)) {
    const snap = await agentHotspotSnapshot();
    if (!snap.ok) {
      console.error("Error getting active users via agent:", snap.error);
      return [];
    }
    return snap.data.activeSessions || [];
  }

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) {
      return [
        { user: "test1", address: "192.168.88.10", uptime: "1d2h", "bytes-in": "12000", "bytes-out": "45000" },
        { user: "test2", address: "192.168.88.11", uptime: "5h", "bytes-in": "5000", "bytes-out": "15000" },
      ];
    }
    const activeMenu = (client as any).menu("/ip hotspot active");
    return activeMenu.get();
  } catch (error: any) {
    console.error("Error getting active users:", error.message);
    return [];
  } finally {
    client.close();
  }
}

export async function getRouterLiveStats(routerId: string): Promise<RouterLiveStats> {
  if (isCloudRouterBlocked()) {
    return {
      success: false,
      wifiClients: 0,
      ethernetClients: 0,
      pppoeClients: 0,
      hotspotActive: 0,
      devices: [],
      errors: [LOCAL_ROUTER_MESSAGE],
      localOnly: true,
      message: LOCAL_ROUTER_MESSAGE,
    };
  }

  console.log("[LIVE STATS VERSION] write-mode-active", { routerId });
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
      apiPort: true,
      networkMode: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  if (shouldUseAgent(router)) {
    const agentRes = await agentLiveStats();
    if (!agentRes.ok) {
      return {
        success: false,
        wifiClients: 0,
        ethernetClients: 0,
        pppoeClients: 0,
        hotspotActive: 0,
        devices: [],
        errors: [agentRes.agentOffline ? AGENT_OFFLINE_MESSAGE : agentRes.error],
        message: agentRes.agentOffline ? AGENT_OFFLINE_MESSAGE : agentRes.error,
      };
    }
    const d = agentRes.data;
    return {
      success: Boolean(d.success),
      wifiClients: Number(d.wifiClients ?? 0),
      ethernetClients: Number(d.ethernetClients ?? 0),
      pppoeClients: Number(d.pppoeClients ?? 0),
      hotspotActive: Number(d.hotspotActive ?? 0),
      devices: (d.devices as RouterLiveDevice[]) ?? [],
      errors: (d.errors as string[]) ?? [],
    };
  }

  const client = await connectRouter(router);
  try {
    let hotspotActive: any[] = [];
    let wirelessRegs: any[] = [];
    let dhcpLeases: any[] = [];
    let pppActive: any[] = [];
    const errors: string[] = [];

    if (isRouterInMockMode(router)) {
      hotspotActive = [
        { user: "BN-TEST-0001", address: "192.168.88.21", "mac-address": "AA:BB:CC:11:22:33", uptime: "15m", "bytes-in": "120000", "bytes-out": "340000" },
      ];
      wirelessRegs = [
        { "mac-address": "AA:BB:CC:11:22:33", uptime: "15m", "rx-byte": "120000", "tx-byte": "340000" },
      ];
      dhcpLeases = [
        { address: "192.168.88.50", "mac-address": "44:55:66:77:88:99", status: "bound", "host-name": "Desktop-PC" },
      ];
      pppActive = [
        { name: "pppoe-user1", address: "10.10.10.2", uptime: "1h20m", "caller-id": "CC:DD:EE:FF:00:11" },
      ];
    } else {
      const [hotspotRes, wirelessRes, dhcpRes, pppRes] = await Promise.all([
        readRouterPathSafe(client, "/ip/hotspot/active", errors),
        readRouterPathSafe(client, "/interface/wireless/registration-table", errors),
        readRouterPathSafe(client, "/ip/dhcp-server/lease", errors),
        readRouterPathSafe(client, "/ppp/active", errors),
      ]);
      hotspotActive = hotspotRes || [];
      wirelessRegs = wirelessRes || [];
      dhcpLeases = dhcpRes || [];
      pppActive = pppRes || [];
    }

    console.log("[Router Live Stats]", { routerId, hotspot: hotspotActive.length, dhcp: dhcpLeases.length, pppoe: pppActive.length });
    console.log("[Hotspot Active Sessions]", { routerId, count: hotspotActive.length });
    console.log("[DHCP Active Leases]", { routerId, count: dhcpLeases.filter((l: any) => l.status === "bound").length });
    console.log("[PPPoE Active Sessions]", { routerId, count: pppActive.length });

    const devices: RouterLiveDevice[] = [];
    const pushDevice = (d: RouterLiveDevice) => {
      if (!devices.some((x) => x.connectionType === d.connectionType && x.ip === d.ip && x.mac === d.mac && x.username === d.username)) {
        devices.push(d);
      }
    };

    for (const s of hotspotActive) {
      pushDevice({
        id: `hs-${s[".id"] ?? s.user ?? s.address ?? Math.random()}`,
        sessionId: s[".id"] ? String(s[".id"]) : null,
        device: s.user || s.address || "Hotspot Device",
        ip: s.address ?? null,
        mac: s["mac-address"] ?? null,
        connectionType: "WIFI",
        uptime: s.uptime ?? null,
        username: s.user ?? null,
        rxBytes: parseRouterOSBytes(s["bytes-in"] ?? s["rx-byte"]),
        txBytes: parseRouterOSBytes(s["bytes-out"] ?? s["tx-byte"]),
      });
    }

    for (const r of wirelessRegs) {
      pushDevice({
        id: `wreg-${r[".id"] ?? r["mac-address"] ?? Math.random()}`,
        sessionId: r[".id"] ? String(r[".id"]) : null,
        device: r["host-name"] || r["mac-address"] || "WiFi Client",
        ip: r.address ?? null,
        mac: r["mac-address"] ?? null,
        connectionType: "WIFI",
        uptime: r.uptime ?? null,
        username: r.user ?? null,
        rxBytes: parseRouterOSBytes(r["rx-byte"]),
        txBytes: parseRouterOSBytes(r["tx-byte"]),
      });
    }

    const boundLeases = dhcpLeases.filter((l: any) => l.status === "bound");
    for (const l of boundLeases) {
      pushDevice({
        id: `dhcp-${l[".id"] ?? l.address ?? l["mac-address"] ?? Math.random()}`,
        sessionId: l[".id"] ? String(l[".id"]) : null,
        device: l["host-name"] || l["mac-address"] || "Ethernet Client",
        ip: l.address ?? null,
        mac: l["mac-address"] ?? null,
        connectionType: "ETHERNET",
        uptime: null,
        username: null,
        rxBytes: null,
        txBytes: null,
      });
    }

    for (const p of pppActive) {
      pushDevice({
        id: `ppp-${p[".id"] ?? p.name ?? Math.random()}`,
        sessionId: p[".id"] ? String(p[".id"]) : null,
        device: p.name || "PPPoE Client",
        ip: p.address ?? null,
        mac: p["caller-id"] ?? null,
        connectionType: "PPPOE",
        uptime: p.uptime ?? null,
        username: p.name ?? null,
        rxBytes: parseRouterOSBytes(p["bytes-in"] ?? p["rx-byte"]),
        txBytes: parseRouterOSBytes(p["bytes-out"] ?? p["tx-byte"]),
      });
    }

    const wifiClients = new Set(devices.filter((d) => d.connectionType === "WIFI").map((d) => d.id)).size;

    return {
      success: errors.length === 0,
      wifiClients,
      ethernetClients: boundLeases.length,
      pppoeClients: pppActive.length,
      hotspotActive: hotspotActive.length,
      devices,
      errors,
    };
  } finally {
    client.close();
  }
}

export async function disconnectRouterDevice(payload: RouterDeviceActionPayload): Promise<{ ok: boolean; message: string; localOnly?: boolean }> {
  if (isCloudRouterBlocked()) {
    return { ok: false, message: LOCAL_ROUTER_MESSAGE, localOnly: true };
  }

  const router = await prisma.router.findUnique({
    where: { id: payload.routerId },
    select: { id: true, networkMode: true },
  });
  if (!router) throw new Error("Routeur introuvable");

  if (payload.type === "ETHERNET") {
    return { ok: false, message: "Non applicable pour Ethernet" };
  }

  if (shouldUseAgent(router)) {
    const res = await agentRouterDeviceAction("disconnect", payload);
    if (!res.ok) {
      return {
        ok: false,
        message: res.agentOffline ? AGENT_OFFLINE_MESSAGE : res.error,
        localOnly: res.agentOffline,
      };
    }
    return {
      ok: true,
      message: String(res.data.message || "Appareil déconnecté"),
    };
  }

  const fullRouter = await prisma.router.findUnique({
    where: { id: payload.routerId },
    select: {
      id: true,
      host: true,
      username: true,
      encryptedPassword: true,
      apiPort: true,
      networkMode: true,
    },
  });
  if (!fullRouter) throw new Error("Routeur introuvable");

  const client = await connectRouter(fullRouter);
  try {
    if (payload.type === "WIFI") {
      if (payload.sessionId) {
        await executeRosCommand(client, "/ip/hotspot/active/remove", [`=.id=${payload.sessionId}`]);
      } else if (payload.user) {
        await removeSessionsByUser(client, "/ip/hotspot/active", "user", payload.user);
      } else {
        throw new Error("sessionId ou user requis pour deconnecter WIFI");
      }
      return { ok: true, message: "Appareil WiFi deconnecte" };
    }
    if (payload.sessionId) {
      await executeRosCommand(client, "/ppp/active/remove", [`=.id=${payload.sessionId}`]);
    } else if (payload.user) {
      await removeSessionsByUser(client, "/ppp/active", "name", payload.user);
    } else {
      throw new Error("sessionId ou user requis pour deconnecter PPPoE");
    }
    return { ok: true, message: "Session PPPoE deconnectee" };
  } catch (e) {
    console.error("[Router Device Action Error]", e);
    throw e;
  } finally {
    client.close();
  }
}

export async function suspendRouterDeviceUser(payload: RouterDeviceActionPayload): Promise<{ ok: boolean; message: string; localOnly?: boolean }> {
  if (isCloudRouterBlocked()) {
    return { ok: false, message: LOCAL_ROUTER_MESSAGE, localOnly: true };
  }

  if (!payload.user) throw new Error("user requis");
  const router = await prisma.router.findUnique({
    where: { id: payload.routerId },
    select: {
      id: true,
      companyId: true,
      host: true,
      username: true,
      encryptedPassword: true,
      apiPort: true,
      networkMode: true,
    },
  });
  if (!router) throw new Error("Routeur introuvable");

  if (shouldUseAgent(router)) {
    const res = await agentRouterDeviceAction("suspend", payload);
    if (!res.ok) {
      return {
        ok: false,
        message: res.agentOffline ? AGENT_OFFLINE_MESSAGE : res.error,
        localOnly: res.agentOffline,
      };
    }
    await prisma.customer.updateMany({
      where: { companyId: router.companyId, username: payload.user },
      data: { status: "SUSPENDED" },
    });
    await prisma.accessToken.updateMany({
      where: {
        companyId: router.companyId,
        token: payload.user,
        status: { notIn: ["EXPIRED", "CANCELLED"] as any[] },
      },
      data: { status: "SUSPENDED" as any },
    });
    return { ok: true, message: String(res.data.message || "Utilisateur suspendu") };
  }

  const client = await connectRouter(router);
  try {
    const userMenu = getRouterMenu(client, "/ip/hotspot/user");
    let disabled = false;
    if (userMenu) {
      const users = await userMenu.where("name", payload.user).get();
      if (users.length > 0) {
        await userMenu.where("name", payload.user).disable();
        disabled = true;
      }
    }
    await removeSessionsByUser(client, "/ip/hotspot/active", "user", payload.user);

    await prisma.customer.updateMany({
      where: { companyId: router.companyId, username: payload.user },
      data: { status: "SUSPENDED" },
    });
    await prisma.accessToken.updateMany({
      where: {
        companyId: router.companyId,
        token: payload.user,
        status: { notIn: ["EXPIRED", "CANCELLED"] as any[] },
      },
      data: { status: "SUSPENDED" as any },
    });

    console.log("[Router Device Suspend]", { routerId: payload.routerId, user: payload.user, disabled });
    return { ok: true, message: "Utilisateur suspendu" };
  } catch (e) {
    console.error("[Router Device Action Error]", e);
    throw e;
  } finally {
    client.close();
  }
}

export async function reactivateRouterDeviceUser(payload: RouterDeviceActionPayload): Promise<{ ok: boolean; message: string; localOnly?: boolean }> {
  if (isCloudRouterBlocked()) {
    return { ok: false, message: LOCAL_ROUTER_MESSAGE, localOnly: true };
  }

  if (!payload.user) throw new Error("user requis");
  const router = await prisma.router.findUnique({
    where: { id: payload.routerId },
    select: {
      id: true,
      companyId: true,
      host: true,
      username: true,
      encryptedPassword: true,
      apiPort: true,
      networkMode: true,
    },
  });
  if (!router) throw new Error("Routeur introuvable");

  const token = await prisma.accessToken.findFirst({
    where: { companyId: router.companyId, token: payload.user },
    select: { id: true, status: true },
  });

  if (shouldUseAgent(router)) {
    const res = await agentRouterDeviceAction("reactivate", payload);
    if (!res.ok) {
      return {
        ok: false,
        message: res.agentOffline ? AGENT_OFFLINE_MESSAGE : res.error,
        localOnly: res.agentOffline,
      };
    }
    if (!token || (token.status !== "EXPIRED" && token.status !== "CANCELLED")) {
      await prisma.customer.updateMany({
        where: { companyId: router.companyId, username: payload.user },
        data: { status: "PENDING" },
      });
      await prisma.accessToken.updateMany({
        where: {
          companyId: router.companyId,
          token: payload.user,
          status: { notIn: ["EXPIRED", "CANCELLED"] as any[] },
        },
        data: { status: "USED" as any },
      });
    }
    await syncHotspotSessions(router.companyId);
    return { ok: true, message: String(res.data.message || "Utilisateur réactivé") };
  }

  const client = await connectRouter(router);
  try {
    const userMenu = getRouterMenu(client, "/ip/hotspot/user");
    if (userMenu) {
      const users = await userMenu.where("name", payload.user).get();
      if (users.length > 0) {
        await userMenu.where("name", payload.user).enable();
      }
    }

    if (!token || (token.status !== "EXPIRED" && token.status !== "CANCELLED")) {
      await prisma.customer.updateMany({
        where: { companyId: router.companyId, username: payload.user },
        data: { status: "PENDING" },
      });
      await prisma.accessToken.updateMany({
        where: {
          companyId: router.companyId,
          token: payload.user,
          status: { notIn: ["EXPIRED", "CANCELLED"] as any[] },
        },
        data: { status: "USED" as any },
      });
    }

    await syncHotspotSessions(router.companyId);
    console.log("[Router Device Reactivate]", { routerId: payload.routerId, user: payload.user, tokenStatus: token?.status ?? null });
    return { ok: true, message: "Utilisateur reactive" };
  } catch (e) {
    console.error("[Router Device Action Error]", e);
    throw e;
  } finally {
    client.close();
  }
}

// --- PPPoE Functions ---

export async function createPppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");
  if (!customer.subscriptions || customer.subscriptions.length === 0) throw new Error("Aucune souscription active trouvée");

  const plan = customer.subscriptions[0].plan;
  const profileName = `bizanet-pppoe-${plan.id}`;
  const client = await connectRouter(customer.router);

  try {
    const profileMenu = (client as any).menu("/ppp profile");
    const profiles = await profileMenu.where("name", profileName).get();
    if (profiles.length === 0) {
      await profileMenu.add({
        name: profileName,
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "only-one": "yes",
      });
    } else {
      await profileMenu.where("name", profileName).set({
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "only-one": "yes",
      });
    }

    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length === 0) {
      await secretMenu.add({
        name: customer.username,
        password: customer.password,
        service: "pppoe",
        profile: profileName,
      });
    } else {
      await secretMenu.where("name", customer.username).set({
        password: customer.password,
        service: "pppoe",
        profile: profileName,
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("CREATE_USER", customer.router.id, customer.companyId, customer.id, error);
    throw error;
  } finally {
    client.close();
  }
}

export async function activatePppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0) {
      await secretMenu.where("name", customer.username).enable();
    }
    
    // Disconnect active session to force reconnect with new status
    const activeMenu = (client as any).menu("/ppp active");
    const activeSessions = await activeMenu.where("name", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function suspendPppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0) {
      await secretMenu.where("name", customer.username).disable();
    }
    
    // Disconnect active session
    const activeMenu = (client as any).menu("/ppp active");
    const activeSessions = await activeMenu.where("name", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function deletePppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0 && secrets[0][".id"]) {
      await secretMenu.remove(secrets[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting PPPoE user:", error);
  } finally {
    client.close();
  }
}

export async function getPppoeActiveUsers(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) return [];
    const activeMenu = (client as any).menu("/ppp active");
    return await activeMenu.get();
  } catch (error: any) {
    console.error("Error getting active PPPoE users:", error.message);
    return [];
  } finally {
    client.close();
  }
}

// --- Wired Ethernet Functions ---

export async function getDhcpLeases(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) {
      return [
        { "mac-address": "AA:BB:CC:DD:EE:FF", "address": "192.168.1.50", "status": "bound", "host-name": "Desktop-PC" }
      ];
    }
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    return await leaseMenu.get();
  } catch (error: any) {
    console.error("Error getting DHCP leases:", error.message);
    return [];
  } finally {
    client.close();
  }
}

export async function createDhcpMacBinding(routerId: string, macAddress: string, ipAddress: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    const leases = await leaseMenu.where("mac-address", macAddress).get();
    
    if (leases.length > 0) {
      const lease = leases[0];
      if (lease.dynamic === "true" || lease.dynamic === true) {
        // Make static
        await (client as any).write([
          "/ip/dhcp-server/lease/make-static",
          `=numbers=${lease[".id"]}`
        ]);
      }
    } else {
      // Create static lease
      await leaseMenu.add({
        "mac-address": macAddress,
        "address": ipAddress,
        comment: "bizanet-wired"
      });
    }
  } catch (error: any) {
    console.error("Error creating DHCP MAC binding:", error.message);
  } finally {
    client.close();
  }
}

export async function activateWiredClient(customerId: string, macAddress: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer || !customer.router) return;
  if (!customer.subscriptions || customer.subscriptions.length === 0) return;

  const plan = customer.subscriptions[0].plan;
  const queueName = `bizanet-wired-${customer.username}`;
  
  const client = await connectRouter(customer.router);
  try {
    // Determine the IP address from DHCP lease to create the Simple Queue
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    const leases = await leaseMenu.where("mac-address", macAddress).get();
    let targetIp = leases.length > 0 ? leases[0].address : null;

    if (!targetIp) throw new Error(`No IP found for MAC ${macAddress}`);

    // Create or update Simple Queue
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    
    const rateLimit = `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`;
    
    if (queues.length === 0) {
      await queueMenu.add({
        name: queueName,
        target: targetIp,
        "max-limit": rateLimit,
        comment: "bizanet-wired"
      });
    } else {
      await queueMenu.where("name", queueName).set({
        target: targetIp,
        "max-limit": rateLimit,
        disabled: "no"
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function suspendWiredClient(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const queueName = `bizanet-wired-${customer.username}`;
  const client = await connectRouter(customer.router);
  try {
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    if (queues.length > 0) {
      // Limit to 1k/1k effectively suspending
      await queueMenu.where("name", queueName).set({
        "max-limit": "1k/1k"
      });
    }
    
    // Optionally: drop existing connections for that IP so it takes effect immediately
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function deleteWiredClient(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const queueName = `bizanet-wired-${customer.username}`;
  const client = await connectRouter(customer.router);
  try {
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    if (queues.length > 0 && queues[0][".id"]) {
      await queueMenu.remove(queues[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting Wired user queue:", error);
  } finally {
    client.close();
  }
}
