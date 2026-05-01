import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { getActiveUsers } from "@/lib/mikrotik";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const router = await prisma.router.findUnique({
      where: { id: params.id }
    });

    if (!router) {
      return NextResponse.json({ error: "Routeur introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, router.companyId);

    try {
      const activeUsers = await getActiveUsers(router.id);
      return NextResponse.json({ activeUsers });
    } catch (error: any) {
      return NextResponse.json({ error: "Impossible de récupérer les utilisateurs actifs", details: error.message }, { status: 500 });
    }

  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
