import { NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getRouterLiveStats } from "@/lib/mikrotik";
import { cloudRouterBlockedResponse, isCloudRouterBlocked } from "@/lib/router-access";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (isCloudRouterBlocked()) {
      return NextResponse.json(cloudRouterBlockedResponse());
    }

    await getAuthContextFromRequest(req);
    const params = await context.params;
    const routerId = params.id;
    const live = await getRouterLiveStats(routerId);

    return NextResponse.json({
      wifiCount: live.wifiClients,
      dhcpCount: live.ethernetClients,
      pppoeCount: live.pppoeClients
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
