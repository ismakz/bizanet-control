import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { suspendRouterDeviceUser } from "@/lib/mikrotik";
import { cloudRouterBlockedResponse, isCloudRouterBlocked } from "@/lib/router-access";

export async function POST(req: Request) {
  try {
    if (isCloudRouterBlocked()) {
      return NextResponse.json(cloudRouterBlockedResponse(), { status: 200 });
    }

    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.COMPANY_ADMIN, Role.BIZANET_CEO]);
    const body = await req.json();

    const routerId = typeof body?.routerId === "string" ? body.routerId : "";
    if (!routerId) return NextResponse.json({ error: "routerId requis" }, { status: 400 });

    const router = await prisma.router.findUnique({ where: { id: routerId }, select: { id: true, companyId: true } });
    if (!router) return NextResponse.json({ error: "Routeur introuvable" }, { status: 404 });
    assertCompanyAccess(auth, router.companyId);

    const result = await suspendRouterDeviceUser({
      routerId,
      type: body?.type,
      user: body?.user ?? null,
      mac: body?.mac ?? null,
      ip: body?.ip ?? null,
      sessionId: body?.sessionId ?? null,
    });
    return NextResponse.json({ success: result.ok, message: result.message });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur suspension appareil" }, { status: 500 });
  }
}
