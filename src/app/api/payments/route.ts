import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { getAuthContextFromRequest } from "@/lib/auth";
import {
  assertCompanyAccess,
  getTenantWhere,
  requireOneOfRoles,
  resolveWriteCompanyId,
} from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const paymentSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().optional(),
  amount: z.coerce.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus)
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const payments = await prisma.payment.findMany({
      where: getTenantWhere(auth),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        customer: { select: { fullName: true, username: true, phone: true } }
      }
    });
    let currency = "USD";
    if (auth.companyId) {
      const company = await prisma.company.findUnique({ where: { id: auth.companyId }, select: { currency: true } });
      if (company) currency = company.currency;
    } else if (payments.length > 0 && payments[0].companyId) {
      const company = await prisma.company.findUnique({ where: { id: payments[0].companyId }, select: { currency: true } });
      if (company) currency = company.currency;
    }

    return NextResponse.json({ payments, currency });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les paiements" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const body = await req.json();
    const parsed = paymentSchema.parse(body);
    const requestedCompanyId =
      typeof body?.companyId === "string" && body.companyId.length > 0 ? body.companyId : null;
    const targetCompanyId = resolveWriteCompanyId(auth, requestedCompanyId);

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.customerId },
      select: { id: true, companyId: true, routerId: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, customer.companyId);
    if (customer.companyId !== targetCompanyId) {
      return NextResponse.json({ error: "Customer hors company ciblée" }, { status: 400 });
    }

    const payment = await prisma.payment.create({
      data: {
        companyId: customer.companyId,
        customerId: parsed.customerId,
        planId: parsed.planId,
        amount: parsed.amount,
        method: parsed.method,
        status: parsed.status,
        createdByUserId: auth.userId
      },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        createdByUserId: true
      }
    });

    await writeAuditLog({
      auth,
      companyId: customer.companyId,
      action: "PAYMENT_CREATED",
      entityType: "Payment",
      message: `Payment created for customer ${payment.customerId} amount ${String(payment.amount)}`,
    });

    if (parsed.status === "APPROVED" && parsed.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: parsed.planId } });
      if (plan) {
        let routerId = customer.routerId;
        if (!routerId) {
          const routers = await prisma.router.findMany({ where: { companyId: customer.companyId } });
          if (routers.length === 1) {
            routerId = routers[0].id;
          }
        }
        
        if (routerId) {
          const now = new Date();
          const { calculateExpiration } = await import("@/lib/time");
          const expiresAt = calculateExpiration(now, plan.durationValue, plan.durationUnit as any);

          await prisma.internetSubscription.updateMany({
            where: { customerId: customer.id, status: "ACTIVE" },
            data: { status: "EXPIRED" },
          });

          await prisma.internetSubscription.create({
            data: {
              companyId: customer.companyId,
              customerId: customer.id,
              planId: plan.id,
              paymentId: payment.id,
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
            const { createHotspotUser, activateUser } = await import("@/lib/mikrotik");
            await createHotspotUser(customer.id);
            await activateUser(customer.id);
            
            await writeAuditLog({
              auth,
              companyId: customer.companyId,
              action: "CUSTOMER_ACTIVATED",
              entityType: "Customer",
              message: `Client activé automatiquement via paiement`,
            });
          } catch (e: any) {
             await writeAuditLog({
              auth,
              companyId: customer.companyId,
              action: "ROUTER_ACTIVATION_FAILED",
              entityType: "Customer",
              message: `Paiement approuvé mais échec d'activation MikroTik: ${e.message}`,
            });
          }
        } else {
             await writeAuditLog({
              auth,
              companyId: customer.companyId,
              action: "ROUTER_ACTIVATION_FAILED",
              entityType: "Customer",
              message: `Paiement approuvé mais aucun routeur assigné au client.`,
            });
        }
      }
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (e instanceof Error && (e.message === "MISSING_COMPANY" || e.message === "COMPANY_ID_REQUIRED")) {
      return NextResponse.json({ error: "companyId requis" }, { status: 400 });
    }
    return NextResponse.json({ error: "Impossible de créer le payment" }, { status: 500 });
  }
}

