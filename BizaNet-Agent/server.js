require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { RouterOSAPI } = require("node-routeros");
const rosMessages = require("node-routeros/dist/messages").default;

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const API_KEY = process.env.AGENT_API_KEY;
const LOG_STACK = process.env.LOG_STACK === "1";

const DEFAULT_TOKEN_PROFILE =
  process.env.MIKROTIK_HOTSPOT_PROFILE || "standar1";

function verifyApiKey(req, res, next) {
  const providedKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      error: "AGENT_API_KEY manquante dans .env",
    });
  }

  if (!providedKey || providedKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
}

function getMikrotikConfig() {
  return {
    host: process.env.MIKROTIK_HOST || "192.168.88.1",
    user: process.env.MIKROTIK_USER || "bizanet",
    password: process.env.MIKROTIK_PASSWORD || "Bizanet123",
    port: Number(process.env.MIKROTIK_PORT || 8728),
    timeout: Number(process.env.MIKROTIK_TIMEOUT_MS || 15000),
  };
}

const NODE_ERRNO_HINTS = {
  [-4078]:
    "ECONNREFUSED — connexion refusée (routeur éteint, mauvaise IP, API désactivée ou port 8728 fermé)",
  [-4081]: "ETIMEDOUT — délai dépassé (routeur injoignable sur le réseau)",
};

function formatMikrotikError(err) {
  if (!err) return "Erreur MikroTik inconnue";

  const cfg = getMikrotikConfig();
  const parts = [];

  if (err.errno === -4078 || err.code === "ECONNREFUSED") {
    parts.push(
      `Impossible de joindre MikroTik ${cfg.host}:${cfg.port} — connexion refusée`
    );
    parts.push(
      "Vérifiez: IP du routeur, API activée (/ip service enable api), port 8728, firewall, même réseau LAN"
    );
    return parts.join(". ");
  }

  if (
    err.errno === -4081 ||
    err.code === "ETIMEDOUT" ||
    err.errno === "SOCKTMOUT"
  ) {
    parts.push(`Timeout connexion MikroTik ${cfg.host}:${cfg.port}`);
    return parts.join(". ");
  }

  if (typeof err.errno === "string" && rosMessages[err.errno]) {
    parts.push(rosMessages[err.errno]);
  } else if (typeof err.errno === "number" && NODE_ERRNO_HINTS[err.errno]) {
    parts.push(NODE_ERRNO_HINTS[err.errno]);
  } else if (err.message) {
    parts.push(err.message);
  } else if (err.errno) {
    parts.push(String(err.errno));
  }

  if (err.code && !parts.some((p) => p.includes(String(err.code)))) {
    parts.push(`code=${err.code}`);
  }

  parts.push(`cible=${cfg.host}:${cfg.port}`);
  return parts.filter(Boolean).join(" | ") || "Erreur MikroTik inconnue";
}

function errorPayload(err, extra = {}) {
  const cfg = getMikrotikConfig();
  return {
    success: false,
    error: formatMikrotikError(err),
    mikrotikError: err?.message || null,
    errno: err?.errno ?? null,
    code: err?.code ?? null,
    routeros: err?.errno && typeof err.errno === "string" ? err.errno : null,
    mikrotik: { host: cfg.host, port: cfg.port, user: cfg.user },
    ...(LOG_STACK && err?.stack ? { stack: err.stack } : {}),
    ...extra,
  };
}

async function connectMikrotik() {
  const cfg = getMikrotikConfig();

  console.log("[MikroTik Connect]", {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    timeout: cfg.timeout,
  });

  const conn = new RouterOSAPI(cfg);
  await conn.connect();

  console.log("[MikroTik Connect] OK");
  return conn;
}

function rosPair(key, value) {
  const str = String(value ?? "");
  if (/[\s'"\\]/.test(str) || str.includes("=")) {
    return `=${key}="${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `=${key}=${str}`;
}

async function findHotspotUser(conn, username) {
  const users = await conn.write("/ip/hotspot/user/print", [`?name=${username}`]);
  return users && users.length > 0 ? users[0] : null;
}

async function findHotspotProfile(conn, profileName) {
  const profiles = await conn.write("/ip/hotspot/user/profile/print", [
    `?name=${profileName}`,
  ]);
  return profiles && profiles.length > 0 ? profiles[0] : null;
}

async function listHotspotProfileNames(conn, limit = 30) {
  const profiles = await conn.write("/ip/hotspot/user/profile/print");
  return (profiles || [])
    .map((p) => p.name)
    .filter(Boolean)
    .slice(0, limit);
}

async function ensureHotspotProfile(conn, profileName) {
  let profile = await findHotspotProfile(conn, profileName);

  if (!profile) {
    console.log("[MikroTik Create] création profil hotspot", profileName);
    await conn.write("/ip/hotspot/user/profile/add", [
      rosPair("name", profileName),
      "=shared-users=1",
    ]);
    profile = await findHotspotProfile(conn, profileName);
    return profile;
  }

  const shared = profile["shared-users"];
  if (shared !== "1" && shared !== 1) {
    console.log(
      "[MikroTik Create] shared-users=1 sur profil",
      profileName,
      "(était:",
      shared,
      ")"
    );
    await conn.write("/ip/hotspot/user/profile/set", [
      `=.id=${profile[".id"]}`,
      "=shared-users=1",
    ]);
  }

  return profile;
}

app.use((req, res, next) => {
  if (req.method === "POST" && req.path.includes("hotspot")) {
    console.log("[Agent Request]", {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
    });
  }
  next();
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "BizaNet Agent",
    status: "running",
    port: PORT,
    defaultHotspotProfile: DEFAULT_TOKEN_PROFILE,
  });
});

/**
 * HEALTH CHECK — requis par BizaNet Control et BizaNet Desktop.
 */
app.get("/health", verifyApiKey, async (req, res) => {
  let conn;

  try {
    const cfg = getMikrotikConfig();
    conn = await connectMikrotik();

    res.json({
      success: true,
      service: "bizanet-agent",
      version: "1.0.0",
      uptime: process.uptime(),
      mikrotik: {
        connected: true,
        lastOkAt: new Date().toISOString(),
        lastError: null,
        reconnectAttempts: 0,
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
      },
    });
  } catch (err) {
    const cfg = getMikrotikConfig();

    res.json({
      success: true,
      service: "bizanet-agent",
      version: "1.0.0",
      uptime: process.uptime(),
      mikrotik: {
        connected: false,
        lastOkAt: null,
        lastError: formatMikrotikError(err),
        reconnectAttempts: 0,
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
      },
    });
  } finally {
    if (conn) conn.close();
  }
});

app.get("/status", verifyApiKey, async (req, res) => {
  let conn;
  try {
    conn = await connectMikrotik();
    const identity = await conn.write("/system/identity/print");
    res.json({ success: true, mikrotik: identity });
  } catch (err) {
    console.error("[MikroTik Error] /status", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.get("/hotspot/users", verifyApiKey, async (req, res) => {
  let conn;
  try {
    conn = await connectMikrotik();
    const users = await conn.write("/ip/hotspot/user/print");
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/users", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/create-user", verifyApiKey, async (req, res) => {
  let conn;

  const body = req.body || {};
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  const profile =
    typeof body.profile === "string" && body.profile.trim()
      ? body.profile.trim()
      : DEFAULT_TOKEN_PROFILE;
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim()
      : "created-by-bizanet";
  const limitUptime = body.limitUptime;
  const disabled = body.disabled === "yes" ? "yes" : "no";

  console.log("[MikroTik Create] body reçu", {
    username,
    profile,
    comment,
    passwordLength: password.length,
  });

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "username et password sont obligatoires",
    });
  }

  try {
    conn = await connectMikrotik();

    const profileRow = await ensureHotspotProfile(conn, profile);
    if (!profileRow) {
      const available = await listHotspotProfileNames(conn);
      const msg = `Profil hotspot "${profile}" introuvable sur MikroTik`;
      console.error("[MikroTik Error]", msg, { available });
      return res.status(400).json({
        success: false,
        error: msg,
        hint: "Créez le profil dans IP → Hotspot → User Profiles (ex: standar1)",
        availableProfiles: available,
      });
    }

    const existing = await findHotspotUser(conn, username);
    const addPayload = [
      rosPair("name", username),
      rosPair("password", password),
      rosPair("profile", profile),
      rosPair("comment", comment),
      rosPair("disabled", disabled),
    ];

    if (limitUptime) {
      addPayload.push(rosPair("limit-uptime", limitUptime));
    }

    let action = "created";
    let routerosCommand;
    let routerosPayload;

    if (existing) {
      action = "updated";
      routerosCommand = "/ip/hotspot/user/set";
      routerosPayload = [
        `=.id=${existing[".id"]}`,
        rosPair("password", password),
        rosPair("profile", profile),
        rosPair("comment", comment),
        rosPair("disabled", disabled),
      ];

      if (limitUptime) {
        routerosPayload.push(rosPair("limit-uptime", limitUptime));
      }

      console.log("[MikroTik Create] utilisateur existant → mise à jour", {
        username,
        id: existing[".id"],
        command: routerosCommand,
        payload: routerosPayload,
      });

      await conn.write(routerosCommand, routerosPayload);
    } else {
      routerosCommand = "/ip/hotspot/user/add";
      routerosPayload = addPayload;

      console.log("[MikroTik Create] nouvel utilisateur", {
        command: routerosCommand,
        payload: routerosPayload,
      });

      const addResult = await conn.write(routerosCommand, routerosPayload);
      console.log("[MikroTik Agent Response] /ip/hotspot/user/add", addResult);
    }

    const created = await findHotspotUser(conn, username);

    console.log("[Hotspot Success]", {
      username,
      profile,
      action,
      mikrotikId: created?.[".id"],
    });

    res.json({
      success: true,
      message:
        action === "updated"
          ? "Hotspot user updated (déjà existant)"
          : "Hotspot user created",
      action,
      username,
      profile,
      mikrotik: created || null,
      routeros: {
        command: routerosCommand,
        payload: routerosPayload,
      },
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/create-user", {
      message: err?.message,
      errno: err?.errno,
      code: err?.code,
      stack: err?.stack,
    });

    res.status(500).json(
      errorPayload(err, {
        username,
        profile,
        routeros: {
          command: "/ip/hotspot/user/add ou /set",
        },
      })
    );
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/remove-user", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "username est obligatoire",
      });
    }

    conn = await connectMikrotik();
    const user = await findHotspotUser(conn, username);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable",
      });
    }

    await conn.write("/ip/hotspot/user/remove", [`=.id=${user[".id"]}`]);

    res.json({
      success: true,
      message: "Hotspot user removed",
      username,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/remove-user", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/disable-user", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "username est obligatoire",
      });
    }

    conn = await connectMikrotik();
    const user = await findHotspotUser(conn, username);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable",
      });
    }

    await conn.write("/ip/hotspot/user/set", [
      `=.id=${user[".id"]}`,
      "=disabled=yes",
    ]);

    res.json({
      success: true,
      message: "Hotspot user disabled",
      username,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/disable-user", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/enable-user", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({
        success: false,
        error: "username est obligatoire",
      });
    }

    conn = await connectMikrotik();
    const user = await findHotspotUser(conn, username);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable",
      });
    }

    await conn.write("/ip/hotspot/user/set", [
      `=.id=${user[".id"]}`,
      "=disabled=no",
    ]);

    res.json({
      success: true,
      message: "Hotspot user enabled",
      username,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/enable-user", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

function parseBytes(value) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyLiveStats(extra = {}) {
  const errors = Array.isArray(extra.errors)
    ? extra.errors.map(String)
    : extra.error
      ? [String(extra.error)]
      : [];

  return {
    success: Boolean(extra.success),
    wifiClients: Number(extra.wifiClients) || 0,
    ethernetClients: Number(extra.ethernetClients) || 0,
    pppoeClients: Number(extra.pppoeClients) || 0,
    hotspotActive: Number(extra.hotspotActive) || 0,
    devices: Array.isArray(extra.devices) ? extra.devices : [],
    errors,
    ...(extra.error ? { error: String(extra.error) } : {}),
  };
}

function safeCloseConn(conn) {
  if (!conn) return;
  try {
    conn.close();
  } catch (closeErr) {
    console.error("[Agent] conn.close() ignoré:", closeErr?.message || closeErr);
  }
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function listHotspotActive(conn) {
  return conn.write("/ip/hotspot/active/print");
}

async function listHotspotUsers(conn) {
  return conn.write("/ip/hotspot/user/print");
}

async function removeHotspotSessionsForUser(conn, username, sessionId) {
  const sessions = await conn.write("/ip/hotspot/active/print", [
    `?user=${username}`,
  ]);

  let removed = 0;

  const targets =
    sessionId != null && String(sessionId).trim()
      ? sessions.filter((s) => String(s[".id"]) === String(sessionId))
      : sessions;

  for (const s of targets) {
    if (!s[".id"]) continue;
    await conn.write("/ip/hotspot/active/remove", [`=.id=${s[".id"]}`]);
    removed += 1;
  }

  return removed;
}

app.post("/hotspot/remove-active", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username, sessionId } = req.body || {};
    if (!username && !sessionId) {
      return res.status(400).json({
        success: false,
        error: "username ou sessionId requis",
      });
    }

    conn = await connectMikrotik();

    let removed = 0;
    if (sessionId) {
      await conn.write("/ip/hotspot/active/remove", [`=.id=${sessionId}`]);
      removed = 1;
    } else {
      removed = await removeHotspotSessionsForUser(conn, username, null);
    }

    res.json({
      success: true,
      message: "Sessions actives supprimées",
      removed,
      username,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/remove-active", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/force-expire", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, error: "username requis" });
    }

    conn = await connectMikrotik();

    const user = await findHotspotUser(conn, username);
    if (user) {
      await conn.write("/ip/hotspot/user/set", [
        `=.id=${user[".id"]}`,
        "=disabled=yes",
      ]);
    }

    const removed = await removeHotspotSessionsForUser(conn, username, null);

    res.json({
      success: true,
      message: "Utilisateur expiré sur MikroTik",
      username,
      sessionsRemoved: removed,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/force-expire", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/session-status", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, error: "username requis" });
    }

    conn = await connectMikrotik();

    const sessions = await conn.write("/ip/hotspot/active/print", [
      `?user=${username}`,
    ]);

    const user = await findHotspotUser(conn, username);
    const disabled =
      user &&
      (user.disabled === true || user.disabled === "true" || user.disabled === "yes");

    if (!sessions || sessions.length === 0) {
      return res.json({
        success: true,
        connected: false,
        address: null,
        uptime: null,
        bytesIn: 0,
        bytesOut: 0,
        disabled: Boolean(disabled),
      });
    }

    const s = sessions[0];

    res.json({
      success: true,
      connected: true,
      address: s.address ?? null,
      uptime: s.uptime ?? null,
      bytesIn: parseBytes(s["bytes-in"]),
      bytesOut: parseBytes(s["bytes-out"]),
      disabled: Boolean(disabled),
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/session-status", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/hotspot/snapshot", verifyApiKey, async (req, res) => {
  let conn;
  try {
    conn = await connectMikrotik();

    const activeSessions = await listHotspotActive(conn);
    const rawUsers = await listHotspotUsers(conn);

    const users = (rawUsers || []).map((u) => ({
      name: String(u.name ?? ""),
      disabled: u.disabled === true || u.disabled === "true" || u.disabled === "yes",
    }));

    res.json({
      success: true,
      activeSessions: activeSessions || [],
      users,
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/snapshot", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post(
  "/hotspot/live-stats",
  verifyApiKey,
  asyncRoute(async (req, res) => {
    let conn = null;
    const errors = [];

    try {
      conn = await connectMikrotik();

      const [hotspotActive, dhcpLeases, pppActive] = await Promise.all([
        conn.write("/ip/hotspot/active/print").catch((e) => {
          errors.push(`hotspot/active: ${e?.message || String(e)}`);
          return [];
        }),
        conn.write("/ip/dhcp-server/lease/print").catch((e) => {
          errors.push(`dhcp: ${e?.message || String(e)}`);
          return [];
        }),
        conn.write("/ppp/active/print").catch((e) => {
          errors.push(`ppp: ${e?.message || String(e)}`);
          return [];
        }),
      ]);

      const devices = [];

      const pushDevice = (d) => {
        if (
          !devices.some(
            (x) =>
              x.connectionType === d.connectionType &&
              x.ip === d.ip &&
              x.mac === d.mac &&
              x.username === d.username
          )
        ) {
          devices.push(d);
        }
      };

      for (const s of hotspotActive || []) {
        pushDevice({
          id: `hs-${s[".id"] ?? s.user ?? s.address ?? Math.random()}`,
          sessionId: s[".id"] ? String(s[".id"]) : null,
          device: s.user || s.address || "Hotspot Device",
          ip: s.address ?? null,
          mac: s["mac-address"] ?? null,
          connectionType: "WIFI",
          uptime: s.uptime ?? null,
          username: s.user ?? null,
          rxBytes: parseBytes(s["bytes-in"] ?? s["rx-byte"]),
          txBytes: parseBytes(s["bytes-out"] ?? s["tx-byte"]),
        });
      }

      const boundLeases = (dhcpLeases || []).filter((l) => l.status === "bound");

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

      for (const p of pppActive || []) {
        pushDevice({
          id: `ppp-${p[".id"] ?? p.name ?? Math.random()}`,
          sessionId: p[".id"] ? String(p[".id"]) : null,
          device: p.name || "PPPoE Client",
          ip: p.address ?? null,
          mac: p["caller-id"] ?? null,
          connectionType: "PPPOE",
          uptime: p.uptime ?? null,
          username: p.name ?? null,
          rxBytes: parseBytes(p["bytes-in"] ?? p["rx-byte"]),
          txBytes: parseBytes(p["bytes-out"] ?? p["tx-byte"]),
        });
      }

      const wifiClients = new Set(
        devices.filter((d) => d.connectionType === "WIFI").map((d) => d.id)
      ).size;

      const result = {
        success: errors.length === 0,
        wifiClients,
        ethernetClients: boundLeases.length,
        pppoeClients: (pppActive || []).length,
        hotspotActive: (hotspotActive || []).length,
        devices,
        errors,
      };

      console.log("[Agent Live Stats]", result);
      return res.status(200).json(result);
    } catch (err) {
      const message = formatMikrotikError(err);
      console.error("[MikroTik Error] /hotspot/live-stats", err);

      const result = emptyLiveStats({
        success: false,
        error: message,
        errors: [message],
      });

      console.log("[Agent Live Stats]", result);
      return res.status(200).json(result);
    } finally {
      safeCloseConn(conn);
    }
  })
);

app.post("/hotspot/sync", verifyApiKey, async (req, res) => {
  let conn;
  try {
    conn = await connectMikrotik();

    const activeSessions = await listHotspotActive(conn);
    const rawUsers = await listHotspotUsers(conn);

    res.json({
      success: true,
      message: "Snapshot hotspot pour synchronisation BizaNet",
      activeSessions: activeSessions || [],
      users: (rawUsers || []).map((u) => ({
        name: String(u.name ?? ""),
        disabled: u.disabled === true || u.disabled === "true" || u.disabled === "yes",
      })),
    });
  } catch (err) {
    console.error("[MikroTik Error] /hotspot/sync", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

async function handleRouterDeviceDisconnect(conn, body) {
  const { type, user, sessionId } = body || {};

  if (type === "ETHERNET") {
    return { ok: false, message: "Non applicable pour Ethernet" };
  }

  if (type === "WIFI") {
    if (sessionId) {
      await conn.write("/ip/hotspot/active/remove", [`=.id=${sessionId}`]);
    } else if (user) {
      await removeHotspotSessionsForUser(conn, user, null);
    } else {
      throw new Error("sessionId ou user requis pour déconnecter WIFI");
    }

    return { ok: true, message: "Appareil WiFi déconnecté" };
  }

  if (sessionId) {
    await conn.write("/ppp/active/remove", [`=.id=${sessionId}`]);
  } else if (user) {
    const sessions = await conn.write("/ppp/active/print", [`?name=${user}`]);
    for (const s of sessions || []) {
      if (s[".id"]) {
        await conn.write("/ppp/active/remove", [`=.id=${s[".id"]}`]);
      }
    }
  } else {
    throw new Error("sessionId ou user requis pour déconnecter PPPoE");
  }

  return { ok: true, message: "Session PPPoE déconnectée" };
}

app.post("/router/devices/disconnect", verifyApiKey, async (req, res) => {
  let conn;
  try {
    conn = await connectMikrotik();
    const result = await handleRouterDeviceDisconnect(conn, req.body);
    res.json({ success: result.ok, ...result });
  } catch (err) {
    console.error("[MikroTik Error] /router/devices/disconnect", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/router/devices/suspend", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { user } = req.body || {};
    if (!user) {
      return res.status(400).json({ success: false, error: "user requis" });
    }

    conn = await connectMikrotik();

    const hotspotUser = await findHotspotUser(conn, user);

    if (hotspotUser) {
      await conn.write("/ip/hotspot/user/set", [
        `=.id=${hotspotUser[".id"]}`,
        "=disabled=yes",
      ]);
    }

    await removeHotspotSessionsForUser(conn, user, null);

    res.json({ success: true, ok: true, message: "Utilisateur suspendu", user });
  } catch (err) {
    console.error("[MikroTik Error] /router/devices/suspend", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.post("/router/devices/reactivate", verifyApiKey, async (req, res) => {
  let conn;
  try {
    const { user } = req.body || {};
    if (!user) {
      return res.status(400).json({ success: false, error: "user requis" });
    }

    conn = await connectMikrotik();

    const hotspotUser = await findHotspotUser(conn, user);

    if (hotspotUser) {
      await conn.write("/ip/hotspot/user/set", [
        `=.id=${hotspotUser[".id"]}`,
        "=disabled=no",
      ]);
    }

    res.json({ success: true, ok: true, message: "Utilisateur réactivé", user });
  } catch (err) {
    console.error("[MikroTik Error] /router/devices/reactivate", err);
    res.status(500).json(errorPayload(err));
  } finally {
    if (conn) conn.close();
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route agent introuvable: ${req.method} ${req.path}`,
    wifiClients: 0,
    ethernetClients: 0,
    pppoeClients: 0,
    hotspotActive: 0,
    devices: [],
    errors: [`Route agent introuvable: ${req.method} ${req.path}`],
  });
});

app.use((err, req, res, next) => {
  console.error("[Agent Error]", err);

  if (res.headersSent) {
    return next(err);
  }

  const message = err?.message || "Erreur interne agent";

  const liveShape =
    req.path === "/hotspot/live-stats"
      ? emptyLiveStats({ success: false, error: message, errors: [message] })
      : {
          success: false,
          error: message,
          ...(LOG_STACK && err.stack ? { stack: err.stack } : {}),
        };

  res.status(500).json(liveShape);
});

app.listen(PORT, () => {
  const cfg = getMikrotikConfig();

  console.log(`BizaNet Agent lancé sur port ${PORT}`);
  console.log(`MikroTik cible: ${cfg.host}:${cfg.port} (user: ${cfg.user})`);
  console.log(`Profil hotspot défaut tickets: ${DEFAULT_TOKEN_PROFILE}`);
});