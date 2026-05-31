import { NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getRouterLiveStats } from "@/lib/mikrotik";
import { cloudRouterBlockedResponse, isCloudRouterBlocked } from "@/lib/router-access";

export async function GET(req: Request) {
  try {
    if (isCloudRouterBlocked()) {
      return NextResponse.json(
        cloudRouterBlockedResponse({
          wifiClients: 0,
          ethernetClients: 0,
          pppoeClients: 0,
          hotspotActive: 0,
          devices: [],
          errors: [],
        })
      );
    }

    console.log("[Router Live Stats API]", { method: "GET", url: req.url });
    const auth = await getAuthContextFromRequest(req);
    const { searchParams } = new URL(req.url);
    const routerIdParam = searchParams.get("routerId");

    const tenantWhere = getTenantWhere(auth);
    let routerId = routerIdParam;

    if (!routerId) {
      const firstRouter = await prisma.router.findFirst({
        where: tenantWhere,
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!firstRouter) {
        return NextResponse.json({
          success: true,
          wifiClients: 0,
          ethernetClients: 0,
          pppoeClients: 0,
          hotspotActive: 0,
          devices: [],
          errors: [],
        });
      }
      routerId = firstRouter.id;
    } else {
      const allowed = await prisma.router.findFirst({
        where: { id: routerId, ...tenantWhere },
        select: { id: true },
      });
      if (!allowed) {
        return NextResponse.json({ error: "Routeur introuvable" }, { status: 404 });
      }
    }

    console.log("[Router Live Stats API]", { routerId, stage: "calling_getRouterLiveStats" });
    const stats = await getRouterLiveStats(routerId);
    return NextResponse.json(stats);
  } catch (e: any) {
    console.error("[Router Live Stats Error]", e);
    const message = e?.message || "Erreur live stats routeur";
    if (e.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        {
          success: false,
          wifiClients: 0,
          ethernetClients: 0,
          pppoeClients: 0,
          hotspotActive: 0,
          devices: [],
          errors: [],
          error: "Authentification requise",
        },
        { status: 401 }
      );
    }
    if (e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json(
        {
          success: false,
          wifiClients: 0,
          ethernetClients: 0,
          pppoeClients: 0,
          hotspotActive: 0,
          devices: [],
          errors: [],
          error: "Accès refusé",
        },
        { status: 403 }
      );
    }
    return NextResponse.json({
      success: false,
      wifiClients: 0,
      ethernetClients: 0,
      pppoeClients: 0,
      hotspotActive: 0,
      devices: [],
      errors: [message],
      error: message,
    });
  }
}
