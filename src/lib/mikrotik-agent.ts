/**
 * Client HTTP vers BizaNet-Agent (MikroTik Hotspot local).
 * Utilisé par Quick Sale, génération de tokens et /api/hotspot/create.
 */

export const AGENT_URL =
  process.env.BIZANET_AGENT_URL || "http://localhost:4000";
export const AGENT_API_KEY =
  process.env.BIZANET_AGENT_API_KEY || "BIZANET_LOCAL_2026";
export const AGENT_FETCH_MS = 20_000;

/** Profil hotspot pour les tickets BN-XXXX-XXXX (Quick Sale / tokens) */
export const HOTSPOT_TOKEN_PROFILE =
  process.env.BIZANET_HOTSPOT_TOKEN_PROFILE || "standar1";

export type MikrotikAgentPayload = {
  username: string;
  password: string;
  profile: string;
  comment: string;
};

export type MikrotikAgentResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      error: string;
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

  if (parts.length > 0) {
    return parts.join(" — ");
  }

  return "";
}

/**
 * Crée un utilisateur hotspot sur MikroTik via BizaNet-Agent.
 */
export async function createHotspotUserOnAgent(
  payload: MikrotikAgentPayload,
  logContext?: string
): Promise<MikrotikAgentResult> {
  const url = `${AGENT_URL}/hotspot/create-user?apiKey=${encodeURIComponent(AGENT_API_KEY)}`;
  const requestBody = {
    username: payload.username,
    password: payload.password,
    profile: payload.profile,
    comment: payload.comment,
  };

  const ctx = logContext ? ` (${logContext})` : "";

  console.log(`[MikroTik Create]${ctx}`, {
    agentUrl: AGENT_URL,
    endpoint: "/hotspot/create-user",
    request: requestBody,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(AGENT_FETCH_MS),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Délai dépassé (${AGENT_FETCH_MS / 1000}s) — BizaNet-Agent injoignable sur ${AGENT_URL}`
        : err instanceof Error
          ? err.message
          : "Erreur communication agent MikroTik";
    console.error(`[MikroTik Error]${ctx}`, { message, request: requestBody });
    return { ok: false, status: 502, error: message };
  }

  const raw = await response.text();
  console.log(`[MikroTik Agent Response]${ctx}`, {
    httpStatus: response.status,
    rawBody: raw.slice(0, 2000),
  });

  const parsed = parseAgentJson(raw);
  if (!parsed.ok) {
    console.error(`[MikroTik Error]${ctx}`, parsed.error);
    return { ok: false, status: 502, error: parsed.error };
  }

  const agentError = extractAgentError(parsed.data);
  const agentSuccess = parsed.data.success !== false && response.ok;

  if (!agentSuccess) {
    const message =
      agentError ||
      `Échec création hotspot MikroTik (HTTP ${response.status})`;
    console.error(`[MikroTik Error]${ctx}`, {
      message,
      httpStatus: response.status,
      agent: parsed.data,
    });
    return {
      ok: false,
      status: response.status >= 400 ? response.status : 502,
      error: message,
      data: parsed.data,
    };
  }

  console.log(`[Hotspot Success]${ctx}`, {
    username: payload.username,
    profile: payload.profile,
    httpStatus: response.status,
    agent: parsed.data,
  });

  return { ok: true, status: response.status, data: parsed.data };
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
