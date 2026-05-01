import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);
    const tenantWhere = getTenantWhere(auth);

    const request = await prisma.deviceChangeRequest.findFirst({
      where: {
        id: params.id,
        ...tenantWhere,
        status: "PENDING"
      },
      include: {
        accessToken: true
      }
    });

    if (!request) {
      return NextResponse.json({ error: "Demande introuvable ou déjà traitée." }, { status: 404 });
    }

    const now = new Date();

    // Rejeter la demande
    await prisma.deviceChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: auth.userId,
        reviewedAt: now
      }
    });

    await writeAuditLog({
      companyId: request.companyId,
      actorUserId: auth.userId,
      action: "DEVICE_CHANGE_REJECTED",
      entityType: "DeviceChangeRequest",
      message: `Changement d'appareil refusé pour le token ${request.accessToken.token}`
    });

    return NextResponse.json({ success: true, message: "Demande rejetée." }, { status: 200 });

  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "Erreur lors du rejet." }, { status: 500 });
  }
}
