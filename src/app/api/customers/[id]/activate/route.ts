import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { activateUser, createHotspotUser } from "@/lib/mikrotik";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: { router: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, customer.companyId);

    const body = await req.json().catch(() => ({}));
    let planId = body.planId;

    if (!planId) {
      const latestPayment = await prisma.payment.findFirst({
        where: { customerId: customer.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
      });
      if (latestPayment && latestPayment.planId) {
        planId = latestPayment.planId;
      } else {
        return NextResponse.json({ error: "planId est requis pour l'activation" }, { status: 400 });
      }
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return NextResponse.json({ error: "Plan introuvable" }, { status: 404 });

    // Handle Router ID fallback
    let routerId = customer.routerId;
    if (!routerId) {
      const routers = await prisma.router.findMany({ where: { companyId: customer.companyId } });
      if (routers.length === 1) {
        routerId = routers[0].id;
      } else if (routers.length === 0) {
        return NextResponse.json({ error: "Aucun routeur trouvé pour cette entreprise." }, { status: 400 });
      } else {
        return NextResponse.json({ error: "Veuillez assigner un routeur à ce client. Plusieurs routeurs sont disponibles." }, { status: 400 });
      }
    }

    const now = new Date();
    const { calculateExpiration } = await import("@/lib/time");
    const expiresAt = calculateExpiration(now, plan.durationValue, plan.durationUnit as any);

    // Update Customer and clear old active subscriptions
    await prisma.internetSubscription.updateMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });

    const subscription = await prisma.internetSubscription.create({
      data: {
        companyId: customer.companyId,
        customerId: customer.id,
        planId: plan.id,
        routerId: routerId,
        startedAt: now,
        expiresAt: expiresAt,
        status: "ACTIVE",
      }
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        status: "ACTIVE",
        expiresAt: expiresAt,
        routerId: routerId,
      }
    });

    try {
      await createHotspotUser(customer.id);
      await activateUser(customer.id);
    } catch (e: any) {
      await writeAuditLog({
        auth,
        companyId: customer.companyId,
        action: "ROUTER_ACTIVATION_FAILED",
        entityType: "Customer",
        message: `Échec d'activation MikroTik pour ${customer.username}: ${e.message}`,
      });
      return NextResponse.json({ success: true, warning: `Activé localement, mais échec sur le routeur: ${e.message}` });
    }

    await writeAuditLog({
      auth,
      companyId: customer.companyId,
      action: "CUSTOMER_ACTIVATED",
      entityType: "Customer",
      message: `Client ${customer.username} activé sur le forfait ${plan.name}`,
    });

    return NextResponse.json({ success: true, subscription });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
