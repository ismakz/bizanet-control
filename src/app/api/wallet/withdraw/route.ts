import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const withdrawSchema = z.object({
  amount: z.number().min(500),
  method: z.string().min(1),
  phone: z.string().min(3),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const body = await req.json();
    const parsed = withdrawSchema.parse(body);

    const wallet = await prisma.wallet.findUnique({
      where: { userId: auth.userId },
      include: { user: { include: { company: true } } }
    });

    if (!wallet || wallet.balance.toNumber() < parsed.amount) {
      return NextResponse.json({ error: "Solde insuffisant" }, { status: 400 });
    }

    // Calcul des retraits en attente
    const pendingWithdrawals = await prisma.withdrawalRequest.aggregate({
      where: { userId: auth.userId, status: "PENDING" },
      _sum: { amount: true }
    });

    const totalPending = pendingWithdrawals._sum.amount?.toNumber() || 0;
    const availableBalance = wallet.balance.toNumber() - totalPending;

    if (availableBalance < parsed.amount) {
      return NextResponse.json({ error: "Solde insuffisant (en tenant compte des retraits en attente)" }, { status: 400 });
    }

    const request = await prisma.withdrawalRequest.create({
      data: {
        userId: auth.userId,
        amount: parsed.amount,
        method: parsed.method,
        phone: parsed.phone,
        status: "PENDING"
      }
    });

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: "WITHDRAWAL_REQUESTED",
      entityType: "WithdrawalRequest",
      message: `Demande de retrait de ${parsed.amount} ${wallet?.user?.company?.currency || "USD"} (${parsed.method}) créée par l'agent.`,
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
