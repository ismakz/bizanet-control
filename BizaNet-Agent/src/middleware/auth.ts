import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function isIpAllowed(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (config.allowedIps.includes("*")) return true;
  return config.allowedIps.some((allowed) => {
    if (allowed === normalized) return true;
    if (allowed.endsWith("*") && normalized.startsWith(allowed.slice(0, -1))) {
      return true;
    }
    return false;
  });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip =
    normalizeIp(
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        ""
    ) || "127.0.0.1";

  if (!isIpAllowed(ip)) {
    return res.status(403).json({
      success: false,
      error: `IP non autorisée: ${ip}`,
    });
  }

  const apiKey =
    (req.headers["x-api-key"] as string) ||
    (typeof req.query.apiKey === "string" ? req.query.apiKey : "");

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      success: false,
      error: "API_KEY invalide",
    });
  }

  if (config.jwtSecret) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : typeof req.query.jwt === "string"
        ? req.query.jwt
        : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "JWT interne requis",
      });
    }

    try {
      jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({
        success: false,
        error: "JWT invalide ou expiré",
      });
    }
  }

  return next();
}
