import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: { customer: true, plan: true, company: true, createdByUser: true }
    });

    if (!payment) {
      return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
    }

    assertCompanyAccess(auth, payment.companyId);

    if (payment.status !== "PENDING") {
      return NextResponse.json({ error: "Le paiement n'est pas en attente" }, { status: 400 });
    }

    if (!payment.plan) {
      return NextResponse.json({ error: "Ce paiement n'a pas de forfait (plan) associé pour l'activation." }, { status: 400 });
    }

    if (!payment.customer) {
      // 1. Transaction atomique pour le paiement de token (sans customer)
      const { updatedPayment } = await prisma.$transaction(async (tx) => {
        const upPay = await tx.payment.update({
          where: { id: payment.id },
          data: { status: "APPROVED" }
        });

        // Logique Commission Bizapay (identique)
        if (payment.createdByUser && payment.createdByUser.role === Role.COMPANY_AGENT) {
          const percentage = payment.company.agentCommissionRate;
          const commissionAmount = payment.amount.mul(percentage).div(100);

          await tx.agentCommission.create({
            data: {
              companyId: payment.companyId,
              agentId: payment.createdByUser.id,
              paymentId: payment.id,
              amount: commissionAmount,
              percentage: percentage,
              status: "AVAILABLE",
            }
          });

          const wallet = await tx.wallet.upsert({
            where: { userId: payment.createdByUser.id },
            create: { userId: payment.createdByUser.id, companyId: payment.companyId, balance: commissionAmount },
            update: { balance: { increment: commissionAmount } }
          });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              userId: payment.createdByUser.id,
              companyId: payment.companyId,
              amount: commissionAmount,
              type: "CREDIT",
              source: "COMMISSION",
              reference: `Commission pour le paiement ${payment.id}`,
              status: "APPROVED"
            }
          });

          await tx.auditLog.create({
            data: {
              companyId: payment.companyId,
              actorUserId: auth.userId,
              action: "COMMISSION_CREATED",
              entityType: "AgentCommission",
              message: `Commission de ${commissionAmount} ${payment.company.currency} créditée à l'agent ${payment.createdByUser.fullName || payment.createdByUser.phone}`,
            }
          });
        }
        
        return { updatedPayment: upPay };
      });

      await writeAuditLog({
        auth,
        companyId: payment.companyId,
        action: "PAYMENT_APPROVED",
        entityType: "Payment",
        message: `Paiement ${payment.id} approuvé (Token ou Anonyme).`,
      });

      return NextResponse.json({ success: true, message: "Paiement approuvé.", payment: updatedPayment });
    }

    // Récupération du routeur pour un Customer existant
    let routerId = payment.customer.routerId;
    if (!routerId) {
      const routers = await prisma.router.findMany({ where: { companyId: payment.companyId } });
      if (routers.length === 1) {
        routerId = routers[0].id;
      } else {
        return NextResponse.json({ error: "Aucun routeur assigné au client et impossible de le déduire automatiquement." }, { status: 400 });
      }
    }

    // 1. Transaction atomique pour le paiement et la commission
    const { updatedPayment, subscription } = await prisma.$transaction(async (tx) => {
      const upPay = await tx.payment.update({
        where: { id: payment.id },
        data: { status: "APPROVED" }
      });

      // Logique Commission Bizapay
      if (payment.createdByUser && payment.createdByUser.role === Role.COMPANY_AGENT) {
        const percentage = payment.company.agentCommissionRate;
        const commissionAmount = payment.amount.mul(percentage).div(100);

        await tx.agentCommission.create({
          data: {
            companyId: payment.companyId,
            agentId: payment.createdByUser.id,
            paymentId: payment.id,
            amount: commissionAmount,
            percentage: percentage,
            status: "AVAILABLE",
          }
        });

        const wallet = await tx.wallet.upsert({
          where: { userId: payment.createdByUser.id },
          create: { userId: payment.createdByUser.id, companyId: payment.companyId, balance: commissionAmount },
          update: { balance: { increment: commissionAmount } }
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            userId: payment.createdByUser.id,
            companyId: payment.companyId,
            amount: commissionAmount,
            type: "CREDIT",
            source: "COMMISSION",
            reference: `Commission pour le paiement ${payment.id}`,
            status: "APPROVED"
          }
        });

        await tx.auditLog.create({
          data: {
            companyId: payment.companyId,
            actorUserId: auth.userId,
            action: "COMMISSION_CREATED",
            entityType: "AgentCommission",
            message: `Commission de ${commissionAmount} ${payment.company.currency} créditée à l'agent ${payment.createdByUser.fullName || payment.createdByUser.phone}`,
          }
        });
      }

      // 2. Création/Mise à jour de la souscription
      const now = new Date();
      const { calculateExpiration } = await import("@/lib/time");
      const expiresAt = calculateExpiration(now, payment.plan!.durationValue, payment.plan!.durationUnit as any);

      await tx.internetSubscription.updateMany({
        where: { customerId: payment.customerId!, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });

      const sub = await tx.internetSubscription.create({
        data: {
          companyId: payment.companyId,
          customerId: payment.customerId!,
          planId: payment.plan!.id,
          paymentId: payment.id,
          routerId: routerId,
          startedAt: now,
          expiresAt: expiresAt,
          status: "ACTIVE",
          networkActivationStatus: "PENDING",
        }
      });

      // 3. Mise à jour du client
      await tx.customer.update({
        where: { id: payment.customerId! },
        data: {
          status: "PENDING",
          expiresAt: expiresAt,
          routerId: routerId,
        }
      });

      return { updatedPayment: upPay, subscription: sub };
    });

    await writeAuditLog({
      auth,
      companyId: payment.companyId,
      action: "PAYMENT_APPROVED",
      entityType: "Payment",
      message: `Paiement ${payment.id} approuvé pour le client ${payment.customer.username}.`,
    });



    // 4. Activation MikroTik (Ne bloque pas en cas d'erreur)
    try {
      const { createHotspotUser, activateUser } = await import("@/lib/mikrotik");
      await createHotspotUser(payment.customerId!);
      const { connected, status } = await activateUser(payment.customerId!);

      await prisma.internetSubscription.update({
        where: { id: subscription.id },
        data: {
          networkActivationStatus: connected ? "SUCCESS" : "PENDING",
        }
      });

      await writeAuditLog({
        auth,
        companyId: payment.companyId,
        action: "CUSTOMER_ACTIVATED",
        entityType: "Customer",
        message: `Client ${payment.customer.username} activé sur MikroTik via le paiement ${payment.id}.`,
      });

      const message = connected
        ? "Paiement approuvé et client connecté au hotspot."
        : `Paiement approuvé. Hotspot activé — en attente de connexion WiFi (statut: ${status}).`;

      return NextResponse.json({ success: true, message, payment: updatedPayment, subscription, connected });
    } catch (e: any) {
      await prisma.internetSubscription.update({
        where: { id: subscription.id },
        data: { networkActivationStatus: "FAILED" }
      });

      await writeAuditLog({
        auth,
        companyId: payment.companyId,
        action: "ROUTER_ACTIVATION_FAILED",
        entityType: "Customer",
        message: `Paiement approuvé, mais erreur d'activation MikroTik pour ${payment.customer.username}: ${e.message}`,
      });

      // Le paiement est validé, mais on prévient que le réseau est en attente
      return NextResponse.json({ success: true, warning: true, message: "Paiement validé, activation réseau en attente. (Routeur injoignable)", payment: updatedPayment });
    }

  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
