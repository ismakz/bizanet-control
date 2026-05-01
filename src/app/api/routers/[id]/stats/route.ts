import { NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getActiveUsers, getDhcpLeases, getPppoeActiveUsers } from "@/lib/mikrotik";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const params = await context.params;
    const routerId = params.id;

    // Concurrency to load everything
    const [hotspotUsers, dhcpLeases, pppoeUsers] = await Promise.all([
      getActiveUsers(routerId),
      getDhcpLeases(routerId),
      getPppoeActiveUsers(routerId)
    ]);

    const activeDhcp = dhcpLeases.filter((l: any) => l.status === "bound");

    return NextResponse.json({
      wifiCount: hotspotUsers.length,
      dhcpCount: activeDhcp.length,
      pppoeCount: pppoeUsers.length
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
