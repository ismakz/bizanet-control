/**
 * Client HTTP vers BizaNet-Agent (pont Vercel/local → MikroTik).
 * Vercel → tunnel public → Agent :3010 → MikroTik 192.168.88.1
 */

import jwt from "jsonwebtoken";

export const AGENT_URL =
  process.env.BIZANET_AGENT_URL || "http://localhost:3010";
export const AGENT_API_KEY =
  process.env.BIZANET_AGENT_API_KEY || "BIZANET_LOCAL_2026";
export const AGENT_JWT_SECRET = process.env.BIZANET_AGENT_JWT_SECRET || "";
export const AGENT_FETCH_MS = 20_000;

export const AGENT_OFFLINE_MESSAGE = "Agent local hors ligne";

/** Profil hotspot pour les tickets BN-XXXX-XXXX (Quick Sale / tokens) */
export const HOTSPOT_TOKEN_PROFILE =
  process.env.BIZANET_HOTSPOT_TOKEN_PROFILE || "standar1";

export type MikrotikAgentPayload = {
  username: string;
  password: string;
  profile: string;
  comment: string;
  limitUptime?: string;
  disabled?: "yes" | "no";
};

export type MikrotikAgentResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      error: string;
      agentOffline?: boolean;
      data?: Record<string, unknown>;
    };

function parseAgentJson(raw: string): {
  ok: true;
  data: Record<string, unknown>;
} | { ok: false; error: string } {
  if (!raw.trim()) {
    return { ok: true, data: {} };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as Record<string, unknown> };
    }
    return { ok: false, error: "Réponse agent invalide (JSON non objet)" };
  } catch {
    return { ok: false, error: "Réponse non-JSON du BizaNet-Agent" };
  }
}

function extractAgentError(data: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof data.error === "string" && data.error) {
    parts.push(data.error);
  } else if (typeof data.message === "string" && data.message) {
    parts.push(data.message);
  }

  if (typeof data.mikrotikError === "string" && data.mikrotikError) {
    parts.push(data.mikrotikError);
  }

  if (typeof data.hint === "string" && data.hint) {
    parts.push(data.hint);
  }

  if (Array.isArray(data.availableProfiles) && data.availableProfiles.length > 0) {
    parts.push(
      `Profils disponibles: ${(data.availableProfiles as string[]).join(", ")}`
    );
  }

  const mikrotik = data.mikrotik;
  if (mikrotik && typeof mikrotik === "object") {
    const m = mikrotik as Record<string, unknown>;
    if (m.host) {
      parts.push(`Routeur ${m.host}:${m.port ?? "8728"}`);
    }
  }

  return parts.length > 0 ? parts.join(" — ") : "";
}

function isAgentUnreachableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.message.includes("fetch failed") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ENOTFOUND") ||
    err.message.includes("injoignable")
  );
}

/** Erreur agent = injoignable ou mauvaise version (pas de coupure vente en 502). */
export function isAgentConnectivityFailure(
  result: MikrotikAgentResult
): boolean {
  if (!result.ok && result.agentOffline) return true;
  const err = (!result.ok ? result.error : "").toLowerCase();
  return (
    err.includes("hors ligne") ||
    err.includes("non-json") ||
    err.includes("introuvable") ||
    err.includes("econnrefused") ||
    err.includes("fetch failed") ||
    err.includes("injoignable") ||
    err.includes("agent local")
  );
}

/** Appel HTTP générique vers BizaNet-Agent. */
export async function callAgent<T extends Record<string, unknown> = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  logContext?: string
): Promise<MikrotikAgentResult & { data: T }> {
  const ctx = logContext ? ` (${logContext})` : "";
  const url = `${AGENT_URL}${path}${
    path.includes("?") ? "&" : "?"
  }apiKey=${encodeURIComponent(AGENT_API_KEY)}`;

  console.log(`[Agent Request]${ctx}`, { method, path, body });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": AGENT_API_KEY,
  };
  if (AGENT_JWT_SECRET) {
    const token = jwt.sign(
      { sub: "bizanet-control", scope: "agent" },
      AGENT_JWT_SECRET,
      { expiresIn: "5m" }
    );
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(AGENT_FETCH_MS),
    });
  } catch (err: unknown) {
    const offline = isAgentUnreachableError(err);
    const message = offline
      ? AGENT_OFFLINE_MESSAGE
      : err instanceof Error
        ? err.message
        : "Erreur communication BizaNet-Agent";
    console.error(`[Agent Error]${ctx}`, message);
    return {
      ok: false,
      status: 502,
      error: message,
      agentOffline: offline,
      data: {} as T,
    };
  }

  const raw = await response.text();
  const parsed = parseAgentJson(raw);
  if (!parsed.ok) {
    console.error(`[Agent Error]${ctx}`, parsed.error, raw.slice(0, 200));
    return {
      ok: false,
      status: 502,
      error: AGENT_OFFLINE_MESSAGE,
      agentOffline: true,
      data: {} as T,
    };
  }

  const agentError = extractAgentError(parsed.data);
  const hasLiveStatsShape =
    path === "/hotspot/live-stats" &&
    Array.isArray((parsed.data as { devices?: unknown }).devices);
  const agentSuccess =
    hasLiveStatsShape || (parsed.data.success !== false && response.ok);

  if (!agentSuccess) {
    const message =
      agentError || `Échec agent (HTTP ${response.status})`;
    const connectivity =
      response.status >= 502 ||
      /introuvable|non-json|injoignable/i.test(message);
    return {
      ok: false,
      status: response.status >= 400 ? response.status : 502,
      error: connectivity ? AGENT_OFFLINE_MESSAGE : message,
      agentOffline: connectivity,
      data: parsed.data as T,
    };
  }

  return { ok: true, status: response.status, data: parsed.data as T };
}

export async function agentGetHealth(): Promise<MikrotikAgentResult> {
  return callAgent("GET", "/health", undefined, "health");
}

export async function agentGetStatus(): Promise<MikrotikAgentResult> {
  const routerStatus = await callAgent("GET", "/router/status", undefined, "router-status");
  if (routerStatus.ok) return routerStatus;
  return callAgent("GET", "/status", undefined, "status");
}

/** Indique si l’agent distant répond (cloud → tunnel → agent local). */
export function isAgentResultOffline(result: MikrotikAgentResult): boolean {
  return !result.ok && Boolean(result.agentOffline);
}

export async function isAgentOnline(): Promise<boolean> {
  const health = await agentGetHealth();
  return health.ok;
}

export async function createHotspotUserOnAgent(
  payload: MikrotikAgentPayload,
  logContext?: string
): Promise<MikrotikAgentResult> {
  const result = await callAgent(
    "POST",
    "/hotspot/create-user",
    {
      username: payload.username,
      password: payload.password,
      profile: payload.profile,
      comment: payload.comment,
      ...(payload.limitUptime ? { limitUptime: payload.limitUptime } : {}),
      ...(payload.disabled ? { disabled: payload.disabled } : {}),
    },
    logContext ?? "create-user"
  );
  if (result.ok) {
    console.log(`[Hotspot Success]${logContext ? ` (${logContext})` : ""}`, {
      username: payload.username,
      profile: payload.profile,
    });
  }
  return result;
}

export async function agentEnableUser(username: string): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/enable-user", { username }, `enable:${username}`);
}

export async function agentDisableUser(username: string): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/disable-user", { username }, `disable:${username}`);
}

export async function agentUpsertHotspotProfile(payload: {
  name: string;
  rateLimit: string;
  sessionTimeout: string;
}): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/upsert-profile", payload, `profile:${payload.name}`);
}

export async function agentRemoveHotspotProfile(name: string): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/remove-profile", { name }, `remove-profile:${name}`);
}

export async function agentUpsertPppProfile(payload: {
  name: string;
  rateLimit: string;
}): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/ppp/upsert-profile", payload, `ppp-profile:${payload.name}`);
}

export async function agentRemovePppProfile(name: string): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/ppp/remove-profile", { name }, `remove-ppp:${name}`);
}

export async function agentRemoveActive(input: {
  username?: string;
  sessionId?: string | null;
}): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/remove-active", input, "remove-active");
}

export async function agentForceExpire(username: string): Promise<MikrotikAgentResult> {
  return callAgent("POST", "/hotspot/force-expire", { username }, `expire:${username}`);
}

export type AgentSessionStatus = {
  connected: boolean;
  address: string | null;
  uptime: string | null;
  bytesIn: number;
  bytesOut: number;
  disabled: boolean;
};

export async function agentSessionStatus(
  username: string
): Promise<MikrotikAgentResult & { data: AgentSessionStatus & Record<string, unknown> }> {
  const result = await callAgent<AgentSessionStatus & Record<string, unknown>>(
    "POST",
    "/hotspot/session-status",
    { username },
    `session:${username}`
  );
  return result;
}

export type AgentHotspotSnapshot = {
  activeSessions: Record<string, unknown>[];
  users: { name: string; disabled: boolean }[];
};

export async function agentHotspotSnapshot(): Promise<
  MikrotikAgentResult & { data: AgentHotspotSnapshot & Record<string, unknown> }
> {
  return callAgent("POST", "/hotspot/snapshot", {}, "snapshot");
}

export type AgentLiveStatsPayload = {
  success: boolean;
  wifiClients: number;
  ethernetClients: number;
  pppoeClients: number;
  hotspotActive: number;
  devices: unknown[];
  errors: string[];
};

export async function agentLiveStats(): Promise<
  MikrotikAgentResult & { data: AgentLiveStatsPayload & Record<string, unknown> }
> {
  return callAgent("POST", "/hotspot/live-stats", {}, "live-stats");
}

export async function agentRouterDeviceAction(
  action: "disconnect" | "suspend" | "reactivate",
  payload: {
    type: "WIFI" | "ETHERNET" | "PPPOE";
    user?: string | null;
    mac?: string | null;
    ip?: string | null;
    sessionId?: string | null;
  }
): Promise<MikrotikAgentResult> {
  return callAgent(
    "POST",
    `/router/devices/${action}`,
    payload,
    `device-${action}`
  );
}

/** Identifiants hotspot pour un code ticket BN-XXXX-XXXX */
export function buildTokenHotspotCredentials(tokenCode: string): {
  username: string;
  password: string;
  profile: string;
  comment: string;
} {
  const code = tokenCode.trim().toUpperCase();
  return {
    username: code,
    password: code,
    profile: HOTSPOT_TOKEN_PROFILE,
    comment: `bizanet-token-${code}`,
  };
}
