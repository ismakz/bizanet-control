import "dotenv/config";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: envInt("PORT", 3010),
  apiKey: process.env.AGENT_API_KEY || "BIZANET_LOCAL_2026",
  jwtSecret: process.env.AGENT_JWT_SECRET || "",
  allowedIps: (process.env.ALLOWED_IPS || "127.0.0.1,::1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  mikrotik: {
    host: process.env.MIKROTIK_HOST || "192.168.88.1",
    port: envInt("MIKROTIK_PORT", 8728),
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    tls: process.env.MIKROTIK_TLS === "true",
  },
  reconnectMs: envInt("MIKROTIK_RECONNECT_MS", 5000),
  heartbeatMs: envInt("HEARTBEAT_INTERVAL_MS", 30000),
  tokenProfile: process.env.HOTSPOT_TOKEN_PROFILE || "standar1",
};
