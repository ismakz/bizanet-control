import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { Role } from "@prisma/client";

const transferSchema = z.object({
  receiverPhone: z.string().min(3),
  amount: z.number().min(1),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_AGENT, Role.COMPANY_ADMIN]);
    const body = await req.json();
    const parsed = transferSchema.parse(body);

    const sender = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { wallet: true, company: true }
    });

    if (!sender || sender.kycStatus !== "APPROVED") {
      return NextResponse.json({ error: "KYC non validé. Vous ne pouvez pas transférer de l'argent avant d'avoir validé votre identité." }, { status: 403 });
    }

    if (!sender.wallet || sender.wallet.balance.toNumber() < parsed.amount) {
      return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
    }

    const receiver = await prisma.user.findUnique({
      where: { phone: parsed.receiverPhone },
      include: { wallet: true }
    });

    if (!receiver) {
      return NextResponse.json({ error: "Agent destinataire introuvable" }, { status: 404 });
    }
    
    if (receiver.companyId !== sender.companyId && sender.role !== Role.BIZANET_CEO) {
        return NextResponse.json({ error: "Impossible de transférer vers un agent d'une autre entreprise" }, { status: 403 });
    }

    if (receiver.id === sender.id) {
        return NextResponse.json({ error: "Vous ne pouvez pas vous transférer de l'argent à vous-même" }, { status: 400 });
    }

    // Effectuer le transfert dans une transaction
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: sender.wallet.id },
        data: { balance: { decrement: parsed.amount } }
      }),
      prisma.wallet.upsert({
        where: { userId: receiver.id },
        create: {
          userId: receiver.id,
          companyId: receiver.companyId!,
          balance: parsed.amount
        },
        update: { balance: { increment: parsed.amount } }
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: sender.wallet.id,
          userId: sender.id,
          companyId: sender.companyId!,
          amount: parsed.amount,
          type: "DEBIT",
          source: "MANUAL",
          status: "APPROVED",
          reference: `Transfert vers ${receiver.fullName} (${receiver.phone})`,
          createdByUserId: sender.id
        }
      }),
      // On log aussi le crédit pour le receveur, mais il faut d'abord chercher son walletId si existant
      // Prisma ne retourne pas l'id du wallet upserté facilement, on va le faire après ou tricher.
    ]);
    
    // Log credit transaction for receiver outside of the main block to get the correct wallet ID
    const receiverWallet = await prisma.wallet.findUnique({ where: { userId: receiver.id } });
    if (receiverWallet) {
        await prisma.walletTransaction.create({
            data: {
                walletId: receiverWallet.id,
                userId: receiver.id,
                companyId: receiver.companyId!,
                amount: parsed.amount,
                type: "CREDIT",
                source: "MANUAL",
                status: "APPROVED",
                reference: `Transfert reçu de ${sender.fullName} (${sender.phone})`,
                createdByUserId: sender.id
            }
        });
    }

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: "AGENT_TRANSFER",
      entityType: "Wallet",
      message: `Transfert de ${parsed.amount} vers ${receiver.fullName} (${receiver.phone}) effectué.`,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
