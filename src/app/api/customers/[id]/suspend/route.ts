import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { suspendUser } from "@/lib/mikrotik";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const customer = await prisma.customer.findUnique({
      where: { id: params.id }
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, customer.companyId);

    // Update DB
    await prisma.customer.update({
      where: { id: customer.id },
      data: { status: "SUSPENDED" },
    });

    await prisma.internetSubscription.updateMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      data: { status: "SUSPENDED" },
    });

    try {
      await suspendUser(customer.id);
    } catch (e: any) {
      await writeAuditLog({
        auth,
        companyId: customer.companyId,
        action: "ROUTER_SUSPEND_FAILED",
        entityType: "Customer",
        message: `Échec de suspension MikroTik pour ${customer.username}: ${e.message}`,
      });
      return NextResponse.json({ success: true, warning: `Suspendu localement, mais échec sur le routeur: ${e.message}` });
    }

    await writeAuditLog({
      auth,
      companyId: customer.companyId,
      action: "CUSTOMER_SUSPENDED",
      entityType: "Customer",
      message: `Client ${customer.username} suspendu manuellement`,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
