import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const tenantWhere = getTenantWhere(auth);

    const subscriptions = await prisma.internetSubscription.findMany({
      where: tenantWhere,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { fullName: true, username: true } },
        plan: { select: { name: true } },
      }
    });

    return NextResponse.json({ subscriptions });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les abonnements" }, { status: 500 });
  }
}
