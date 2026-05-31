import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getAuthContextFromRequest } from "@/lib/auth";
import { requireOneOfRoles } from "@/lib/permissions";
import { syncHotspotSessions } from "@/lib/mikrotik";
import { cloudRouterBlockedResponse } from "@/lib/router-access";
import { canRunHotspotSync } from "@/lib/mikrotik";

export async function POST(req: Request) {
  try {
    if (!canRunHotspotSync()) {
      return NextResponse.json(cloudRouterBlockedResponse());
    }

    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [
      Role.BIZANET_CEO,
      Role.BIZANET_SUPPORT,
      Role.COMPANY_ADMIN,
      Role.COMPANY_AGENT,
    ]);

    const result = await syncHotspotSessions(auth.companyId ?? undefined);
    return NextResponse.json({
      success: true,
      message: `${result.expired} ticket(s) expire(s)`,
      result,
    });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    if (e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }
    return NextResponse.json(
      { error: e.message || "Erreur expiration tickets" },
      { status: 500 }
    );
  }
}
