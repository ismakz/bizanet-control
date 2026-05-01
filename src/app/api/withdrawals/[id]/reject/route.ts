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

    const updatedRequest = await prisma.withdrawalRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", processedAt: new Date() }
    });

    await writeAuditLog({
      auth,
      companyId: request.user.companyId,
      action: "WITHDRAWAL_REJECTED",
      entityType: "WithdrawalRequest",
      message: `Retrait de ${request.amount} rejeté pour l'agent ${request.user.phone}`,
    });

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
