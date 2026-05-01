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

    // Approuver la demande
    await prisma.$transaction(async (tx) => {
      // 1. Mettre à jour la demande
      await tx.deviceChangeRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          reviewedByUserId: auth.userId,
          reviewedAt: now
        }
      });

      // 2. Mettre à jour le Token avec le nouveau deviceId
      await tx.accessToken.update({
        where: { id: request.accessTokenId },
        data: {
          boundDeviceId: request.newDeviceId,
        }
      });

      // 3. Désactiver les anciens devices
      await tx.customerDevice.updateMany({
        where: { accessTokenId: request.accessTokenId },
        data: { isActive: false }
      });
      
      // 4. (Optionnel) Créer ou activer le nouveau CustomerDevice
      // On le créera lors de la prochaine activation sur le portail
    });

    await writeAuditLog({
      companyId: request.companyId,
      actorUserId: auth.userId,
      action: "DEVICE_CHANGE_APPROVED",
      entityType: "DeviceChangeRequest",
      message: `Changement d'appareil approuvé pour le token ${request.accessToken.token} (nouveau: ${request.newDeviceId})`
    });

    return NextResponse.json({ success: true, message: "Changement d'appareil approuvé." }, { status: 200 });

  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: "Erreur lors de l'approbation." }, { status: 500 });
  }
}
