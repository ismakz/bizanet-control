import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO]);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      dbStatusCount,
      offlineRouters,
      failedNetworkJobs,
      suspiciousTokens,
      loginFailures,
      systemSettings,
    ] = await Promise.all([
      prisma.company.count(), // Simple query to check DB health
      prisma.router.count({ where: { status: "OFFLINE" } }),
      prisma.networkJob.count({ where: { status: "FAILED", createdAt: { gte: oneDayAgo } } }),
      prisma.accessToken.count({ where: { riskLevel: { in: ["WATCH", "BLOCKED"] } } }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: oneDayAgo } } }),
      prisma.systemSetting.findMany(),
    ]);

    const settingsMap = systemSettings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Déterminer le statut global
    let globalStatus = "HEALTHY";
    let score = 0;
    
    if (offlineRouters > 0) score += 2;
    if (failedNetworkJobs > 10) score += 1;
    if (suspiciousTokens > 20) score += 1;
    if (loginFailures > 100) score += 1;

    if (score >= 3) {
      globalStatus = "CRITICAL";
    } else if (score > 0) {
      globalStatus = "WARNING";
    }

    return NextResponse.json({
      globalStatus,
      metrics: {
        offlineRouters,
        failedNetworkJobs,
        suspiciousTokens,
        loginFailures,
      },
      system: {
        db: "OK",
        auth: loginFailures > 50 ? "WARNING" : "OK",
        networkMode: process.env.NEXT_PUBLIC_BIZANET_NETWORK_MODE || "live",
        lastCronRun: settingsMap["LAST_CRON_RUN"] || "Inconnu",
        version: process.env.npm_package_version || "0.1.0"
      }
    });

  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: "Erreur interne", details: e.message }, { status: 500 });
  }
}
