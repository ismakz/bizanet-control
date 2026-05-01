import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Role, TransactionType, TransactionSource } from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const topupSchema = z.object({
  agentId: z.string().cuid(),
  amount: z.number().positive(),
  note: z.string().optional()
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_AGENT, Role.COMPANY_ADMIN]);

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId") || auth.userId;

    if (auth.role === Role.COMPANY_AGENT && targetUserId !== auth.userId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: targetUserId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        user: { select: { company: { select: { currency: true } } } }
      }
    });

    const commissions = await prisma.agentCommission.findMany({
      where: { agentId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        payment: {
          select: { id: true, amount: true, customer: { select: { username: true } } }
        }
      }
    });

    const withdrawalRequests = await prisma.withdrawalRequest.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return NextResponse.json({
      wallet: wallet || { balance: 0, transactions: [] },
      currency: wallet?.user?.company?.currency || "USD",
      commissions,
      withdrawalRequests
    });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_ADMIN]);

    if (!auth.companyId) {
      return NextResponse.json({ error: "CompanyId manquant" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = topupSchema.parse(body);

    const agent = await prisma.user.findFirst({
      where: { id: parsed.agentId, companyId: auth.companyId, role: Role.COMPANY_AGENT }
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    }

    let wallet = await prisma.wallet.findUnique({ where: { userId: agent.id } });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId: agent.id, companyId: auth.companyId, balance: 0 }
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: parsed.amount } }
      });

      await tx.walletTransaction.create({
        data: {
          walletId: updatedWallet.id,
          userId: agent.id,
          companyId: auth.companyId!,
          amount: parsed.amount,
          type: TransactionType.CREDIT,
          source: TransactionSource.ADMIN_TOPUP,
          reference: parsed.note,
          status: "APPROVED",
          createdByUserId: auth.userId
        }
      });

      return updatedWallet;
    });

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: "AGENT_WALLET_TOPUP",
      entityType: "Wallet",
      message: `Recharge de ${parsed.amount} effectuée pour l'agent ${agent.fullName}`,
    });

    return NextResponse.json({ success: true, balance: result.balance }, { status: 200 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
