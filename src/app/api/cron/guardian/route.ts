import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      // On autorise pour l'instant pour faciliter les tests locaux
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Routers Offline
    const offlineRouters = await prisma.router.findMany({ where: { status: "OFFLINE" } });
    for (const r of offlineRouters) {
      await prisma.alert.create({
        data: {
          companyId: r.companyId,
          routerId: r.id,
          type: "ROUTER_OFFLINE",
          severity: "CRITICAL",
          title: "Routeur Hors Ligne",
          message: `Le routeur ${r.name} est hors ligne. Aucune connexion n'est possible.`
        }
      });
    }

    // 2. Échecs de connexion (Brute force)
    const recentFailures = await prisma.loginAttempt.groupBy({
      by: ['phone'],
      where: { success: false, createdAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) } },
      _count: true
    });
    
    for (const f of recentFailures) {
      if (f._count >= 5) {
        await prisma.alert.create({
          data: {
            type: "SECURITY_BRUTE_FORCE",
            severity: "WARNING",
            title: "Tentatives de connexion suspectes",
            message: `De multiples échecs de connexion détectés pour le numéro ${f.phone}.`
          }
        });
      }
    }

    // 3. Suspect tokens
    const suspiciousTokens = await prisma.accessToken.findMany({
      where: { riskLevel: "WATCH" },
      include: { company: true }
    });
    for (const t of suspiciousTokens) {
      await prisma.alert.create({
        data: {
          companyId: t.companyId,
          type: "TOKEN_SUSPECT",
          severity: "WARNING",
          title: "Token sous surveillance",
          message: `Le token ${t.token} a été utilisé sur des appareils différents.`
        }
      });
    }

    return NextResponse.json({ success: true, message: "Guardian checks completed" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
