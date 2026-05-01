import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO]);

    const request = await prisma.withdrawalRequest.findUnique({
      where: { id: params.id },
      include: { user: true }
    });

    if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    if (request.status !== "PENDING") return NextResponse.json({ error: "Demande déjà traitée" }, { status: 400 });

    const updatedRequest = await prisma.$transaction(async (tx) => {
      // 1. Marquer comme approuvée
      const upReq = await tx.withdrawalRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", processedAt: new Date() }
      });

      // 2. Décrémenter le wallet et créer la transaction de DEBIT
      const wallet = await tx.wallet.update({
        where: { userId: request.userId },
        data: { balance: { decrement: request.amount } }
      });

      if (wallet.balance.toNumber() < 0) {
        throw new Error("Solde insuffisant au moment de l'approbation.");
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: request.userId,
          companyId: request.user.companyId!,
          amount: request.amount,
          type: "DEBIT",
          source: "WITHDRAWAL",
          reference: `Retrait approuvé: ${request.method} - ${request.phone}`,
          status: "APPROVED"
        }
      });

      await tx.auditLog.create({
        data: {
          companyId: request.user.companyId,
          actorUserId: auth.userId,
          action: "WITHDRAWAL_APPROVED",
          entityType: "WithdrawalRequest",
          message: `Retrait de ${request.amount} approuvé pour l'agent ${request.user.phone}`,
        }
      });

      return upReq;
    });

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
