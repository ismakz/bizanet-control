import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TokenStatus, Role, PaymentMethod, PaymentStatus, TransactionType, TransactionSource } from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

function generateToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 1, I, 0, O
  let token = "BN-";
  for (let i = 0; i < 4; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  token += "-";
  for (let i = 0; i < 4; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

const generateTokensSchema = z.object({
  planId: z.string().cuid(),
  quantity: z.number().int().min(1).max(100),
  routerId: z.string().cuid().optional(),
  markAsPaid: z.boolean().default(false),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  isQuickSale: z.boolean().optional()
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const tenantWhere = getTenantWhere(auth);

    const agentWhere = auth.role === Role.COMPANY_AGENT ? { generatedByUserId: auth.userId } : {};

    const tokens = await prisma.accessToken.findMany({
      where: { ...tenantWhere, ...agentWhere },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true, durationValue: true, durationUnit: true, downloadLimitMbps: true, uploadLimitMbps: true } },
        assignedCustomer: { select: { fullName: true, username: true } },
        generatedByUser: { select: { fullName: true } },
        company: { select: { name: true, city: true, ownerPhone: true } }
      }
    });

    return NextResponse.json({ tokens });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);
    
    if (!auth.companyId) {
      return NextResponse.json({ error: "CompanyId manquant" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = generateTokensSchema.parse(body);

    const plan = await prisma.plan.findFirst({
      where: { id: parsed.planId, companyId: auth.companyId }
    });

    if (!plan) {
      return NextResponse.json({ error: "Forfait introuvable" }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: auth.companyId }
    });

    if (!company) {
      return NextResponse.json({ error: "Company introuvable" }, { status: 404 });
    }

    const totalPrice = Number(plan.price) * parsed.quantity;

    if (auth.role === Role.COMPANY_AGENT) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet || Number(wallet.balance) < totalPrice) {
        return NextResponse.json({ error: "Solde insuffisant. Demandez une recharge à votre administrateur." }, { status: 400 });
      }
    }

    const newTokens: import("@prisma/client").AccessToken[] = [];
    
    // We run this in a transaction to ensure all tokens and payments are created together
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < parsed.quantity; i++) {
        let uniqueToken = "";
        let isUnique = false;
        // Simple uniqueness check loop (in real-world, might want to generate bulk and check)
        while (!isUnique) {
          uniqueToken = generateToken();
          const existing = await tx.accessToken.findUnique({ where: { token: uniqueToken } });
          if (!existing) isUnique = true;
        }

        const accessToken = await tx.accessToken.create({
          data: {
            companyId: auth.companyId!,
            planId: plan.id,
            routerId: parsed.routerId,
            token: uniqueToken,
            status: TokenStatus.UNUSED,
            generatedByUserId: auth.userId,
            price: plan.price,
            currency: company.currency
          }
        });

        if (parsed.markAsPaid && parsed.paymentMethod) {
          await tx.payment.create({
            data: {
              companyId: auth.companyId!,
              planId: plan.id,
              amount: plan.price,
              method: parsed.paymentMethod,
              status: PaymentStatus.APPROVED,
              createdByUserId: auth.userId,
              accessTokenId: accessToken.id
            }
          });
        }

        newTokens.push(accessToken);
      }

      if (auth.role === Role.COMPANY_AGENT) {
        const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
        if (!wallet || Number(wallet.balance) < totalPrice) {
          throw new Error("INSUFFICIENT_FUNDS");
        }
        
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalPrice } }
        });

        await tx.walletTransaction.create({
          data: {
            walletId: updatedWallet.id,
            userId: auth.userId,
            companyId: auth.companyId!,
            amount: totalPrice,
            type: TransactionType.DEBIT,
            source: TransactionSource.TOKEN_SALE,
            reference: `Vente de ${parsed.quantity} token(s) ${plan.name}`,
            status: "APPROVED",
            createdByUserId: auth.userId
          }
        });
      }
    });

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: parsed.isQuickSale ? "QUICK_SALE_CREATED" : "TOKENS_GENERATED",
      entityType: "AccessToken",
      message: parsed.isQuickSale 
        ? `Vente rapide d'un token pour le forfait ${plan.name}` 
        : `${parsed.quantity} tokens générés pour le forfait ${plan.name}`,
    });

    return NextResponse.json({ success: true, count: newTokens.length, tokens: newTokens.map(t => ({ ...t, plan, company })) }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map(i => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Solde insuffisant." }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "Impossible de générer les tokens" }, { status: 500 });
  }
}
