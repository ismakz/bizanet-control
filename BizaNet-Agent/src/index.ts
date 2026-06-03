import express from "express";
import { config } from "./config";
import { logger } from "./logger";
import { authMiddleware } from "./middleware/auth";
import { apiRouter } from "./routes";
import { startMikrotikHeartbeat, stopMikrotikHeartbeat } from "./mikrotik/connection";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.socket.remoteAddress,
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({
    service: "BizaNet-Agent",
    port: config.port,
    endpoints: [
      "GET /health",
      "GET /router/status",
      "POST /hotspot/create-user",
      "POST /hotspot/remove-user",
      "POST /hotspot/upsert-profile",
      "POST /hotspot/remove-profile",
    ],
  });
});

app.use(authMiddleware);
app.use(apiRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route introuvable" });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const message = err instanceof Error ? err.message : "Erreur interne";
    logger.error("Unhandled error", { error: message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: message });
    }
  }
);

const server = app.listen(config.port, () => {
  logger.info(`BizaNet-Agent écoute sur http://127.0.0.1:${config.port}`);
  startMikrotikHeartbeat();
});

function shutdown(signal: string) {
  logger.info(`Arrêt (${signal})…`);
  stopMikrotikHeartbeat();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (e) => {
  logger.error("uncaughtException", { error: e.message });
});
process.on("unhandledRejection", (e) => {
  logger.error("unhandledRejection", {
    error: e instanceof Error ? e.message : String(e),
  });
});
