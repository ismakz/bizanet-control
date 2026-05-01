import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { testRouterConnection } from "@/lib/mikrotik";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const router = await prisma.router.findUnique({
      where: { id: params.id }
    });

    if (!router) {
      return NextResponse.json({ error: "Routeur introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, router.companyId);

    const isConnected = await testRouterConnection(router.id);
    
    const updatedRouter = await prisma.router.findUnique({ where: { id: router.id } });

    if (isConnected) {
      return NextResponse.json({ success: true, router: updatedRouter });
    } else {
      return NextResponse.json({ success: false, error: updatedRouter?.lastError || "Échec de connexion", router: updatedRouter }, { status: 400 });
    }
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
