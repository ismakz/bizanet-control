import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { testRouterConnection } from "@/lib/mikrotik";
import { writeAuditLog } from "@/lib/audit";
import { cloudRouterBlockedResponse, isCloudRouterBlocked } from "@/lib/router-access";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    if (isCloudRouterBlocked()) {
      return NextResponse.json(cloudRouterBlockedResponse(), { status: 200 });
    }

    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const router = await prisma.router.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true },
    });

    if (!router) {
      return NextResponse.json({ error: "Routeur introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, router.companyId);

    const result = await testRouterConnection(router.id);

    if ("localOnly" in result && result.localOnly) {
      return NextResponse.json(cloudRouterBlockedResponse(), { status: 200 });
    }

    await writeAuditLog({
      auth,
      companyId: router.companyId,
      action: "ROUTER_TESTED",
      entityType: "Router",
      message: `Router test ${result.success ? "success" : "failed"}: ${router.name}`,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: result.message, router: result.router });
    }
    return NextResponse.json(
      {
        success: false,
        error: result.message,
        router: result.router,
      },
      { status: 400 },
    );
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
