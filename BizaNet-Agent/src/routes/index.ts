import { Router, Request, Response } from "express";
import { getRouterState, refreshMikrotikConnection } from "../mikrotik/connection";
import { config } from "../config";
import * as hotspot from "../mikrotik/hotspot";
import * as queue from "../mikrotik/queue";
import { logger } from "../logger";

function asyncRoute(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      const availableProfiles = (e as { availableProfiles?: string[] })
        .availableProfiles;
      logger.error("Route error", { path: req.path, error: message });
      res.status(500).json({
        success: false,
        error: message,
        mikrotikError: message,
        availableProfiles,
        mikrotik: { host: config.mikrotik.host, port: config.mikrotik.port },
      });
    });
  };
}

export const apiRouter = Router();

apiRouter.get(
  "/health",
  asyncRoute(async (_req, res) => {
    const router = getRouterState();
    res.json({
      success: true,
      service: "bizanet-agent",
      version: "1.0.0",
      uptime: process.uptime(),
      mikrotik: router,
    });
  })
);

apiRouter.get(
  "/router/status",
  asyncRoute(async (_req, res) => {
    const router = await refreshMikrotikConnection();
    res.json({
      success: router.connected,
      message: router.connected
        ? "MikroTik connecté"
        : router.lastError || "MikroTik déconnecté",
      mikrotik: router,
    });
  })
);

/** Compatibilité BizaNet Control existant */
apiRouter.get("/status", (_req, res) => {
  const router = getRouterState();
  res.json({
    success: router.connected,
    message: router.connected ? "OK" : router.lastError,
    mikrotik: router,
  });
});

apiRouter.post(
  "/hotspot/create-user",
  asyncRoute(async (req, res) => {
    const { username, password, profile, comment, limitUptime, disabled } =
      req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ success: false, error: "username et password requis" });
      return;
    }
    const result = await hotspot.createHotspotUser({
      username: String(username),
      password: String(password),
      profile: profile ? String(profile) : config.tokenProfile,
      comment: comment ? String(comment) : undefined,
      limitUptime: limitUptime ? String(limitUptime) : undefined,
      disabled: disabled === "yes" ? "yes" : "no",
    });
    res.json({ success: true, ...result, username });
  })
);

apiRouter.post(
  "/hotspot/remove-user",
  asyncRoute(async (req, res) => {
    const username = req.body?.username;
    if (!username) {
      res.status(400).json({ success: false, error: "username requis" });
      return;
    }
    await hotspot.removeHotspotUser(String(username));
    res.json({ success: true, username });
  })
);

apiRouter.post(
  "/hotspot/upsert-profile",
  asyncRoute(async (req, res) => {
    const { name, rateLimit, sessionTimeout } = req.body ?? {};
    if (!name || !rateLimit) {
      res.status(400).json({ success: false, error: "name et rateLimit requis" });
      return;
    }
    await hotspot.upsertHotspotProfile({
      name: String(name),
      rateLimit: String(rateLimit),
      sessionTimeout: sessionTimeout ? String(sessionTimeout) : undefined,
    });
    res.json({ success: true, name });
  })
);

apiRouter.post(
  "/hotspot/remove-profile",
  asyncRoute(async (req, res) => {
    const name = req.body?.name;
    if (!name) {
      res.status(400).json({ success: false, error: "name requis" });
      return;
    }
    await hotspot.removeHotspotProfile(String(name));
    res.json({ success: true, name });
  })
);

apiRouter.post(
  "/hotspot/enable-user",
  asyncRoute(async (req, res) => {
    const username = req.body?.username;
    if (!username) {
      res.status(400).json({ success: false, error: "username requis" });
      return;
    }
    await hotspot.enableHotspotUser(String(username));
    res.json({ success: true });
  })
);

apiRouter.post(
  "/hotspot/disable-user",
  asyncRoute(async (req, res) => {
    const username = req.body?.username;
    if (!username) {
      res.status(400).json({ success: false, error: "username requis" });
      return;
    }
    await hotspot.disableHotspotUser(String(username));
    res.json({ success: true });
  })
);

apiRouter.post(
  "/hotspot/remove-active",
  asyncRoute(async (req, res) => {
    await hotspot.removeActiveSession({
      username: req.body?.username ? String(req.body.username) : undefined,
      sessionId: req.body?.sessionId ? String(req.body.sessionId) : null,
    });
    res.json({ success: true });
  })
);

apiRouter.post(
  "/hotspot/force-expire",
  asyncRoute(async (req, res) => {
    const username = req.body?.username;
    if (!username) {
      res.status(400).json({ success: false, error: "username requis" });
      return;
    }
    const stats = await hotspot.forceExpireUser(String(username));
    res.json({ success: true, ...stats });
  })
);

apiRouter.post(
  "/hotspot/session-status",
  asyncRoute(async (req, res) => {
    const username = req.body?.username;
    if (!username) {
      res.status(400).json({ success: false, error: "username requis" });
      return;
    }
    const status = await hotspot.getSessionStatus(String(username));
    res.json({ success: true, ...status });
  })
);

apiRouter.post(
  "/hotspot/snapshot",
  asyncRoute(async (_req, res) => {
    const snap = await hotspot.hotspotSnapshot();
    res.json({ success: true, ...snap });
  })
);

apiRouter.post(
  "/hotspot/live-stats",
  asyncRoute(async (_req, res) => {
    const snap = await hotspot.hotspotSnapshot();
    const devices = snap.activeSessions.map((s, i) => ({
      id: String(s[".id"] ?? `sess-${i}`),
      sessionId: String(s[".id"] ?? ""),
      device: "wifi",
      ip: typeof s.address === "string" ? s.address : null,
      mac: typeof s["mac-address"] === "string" ? s["mac-address"] : null,
      connectionType: "WIFI",
      uptime: typeof s.uptime === "string" ? s.uptime : null,
      username: typeof s.user === "string" ? s.user : null,
      rxBytes: Number(s["bytes-in"] ?? 0) || 0,
      txBytes: Number(s["bytes-out"] ?? 0) || 0,
    }));
    res.json({
      success: true,
      wifiClients: devices.length,
      ethernetClients: 0,
      pppoeClients: 0,
      hotspotActive: devices.length,
      devices,
      errors: [],
    });
  })
);

apiRouter.post(
  "/queue/upsert",
  asyncRoute(async (req, res) => {
    const { name, target, maxLimit, comment } = req.body ?? {};
    if (!name || !target || !maxLimit) {
      res.status(400).json({
        success: false,
        error: "name, target et maxLimit requis",
      });
      return;
    }
    await queue.upsertSimpleQueue({
      name: String(name),
      target: String(target),
      maxLimit: String(maxLimit),
      comment: comment ? String(comment) : undefined,
    });
    res.json({ success: true });
  })
);

apiRouter.post(
  "/queue/remove",
  asyncRoute(async (req, res) => {
    const name = req.body?.name;
    if (!name) {
      res.status(400).json({ success: false, error: "name requis" });
      return;
    }
    await queue.removeSimpleQueue(String(name));
    res.json({ success: true });
  })
);

apiRouter.post(
  "/router/devices/:action",
  asyncRoute(async (req, res) => {
    const action = req.params.action;
    const username = req.body?.user ? String(req.body.user) : undefined;
    if (!username) {
      res.status(400).json({ success: false, error: "user requis" });
      return;
    }
    if (action === "disconnect" || action === "suspend") {
      await hotspot.removeActiveSession({ username });
      if (action === "suspend") await hotspot.disableHotspotUser(username);
    } else if (action === "reactivate") {
      await hotspot.enableHotspotUser(username);
    } else {
      res.status(400).json({ success: false, error: "action invalide" });
      return;
    }
    res.json({ success: true });
  })
);
