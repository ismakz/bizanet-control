import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TokenStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";

const requestDeviceChangeSchema = z.object({
  token: z.string().min(1),
  newDeviceId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = requestDeviceChangeSchema.parse(body);
    const tokenStr = parsed.token.toUpperCase().trim();

    const accessToken = await prisma.accessToken.findUnique({
      where: { token: tokenStr },
    });

    if (!accessToken) {
      return NextResponse.json({ error: "Code d'accès invalide." }, { status: 404 });
    }

    if (accessToken.status !== TokenStatus.ACTIVE && accessToken.status !== TokenStatus.USED) {
      return NextResponse.json({ error: "Ce code n'est pas actif." }, { status: 400 });
    }

    if (!accessToken.boundDeviceId) {
      return NextResponse.json({ error: "Ce code n'est lié à aucun appareil." }, { status: 400 });
    }

    if (accessToken.boundDeviceId === parsed.newDeviceId) {
      return NextResponse.json({ error: "Cet appareil est déjà autorisé." }, { status: 400 });
    }

    // Vérifier si une demande est déjà en cours
    const existingRequest = await prisma.deviceChangeRequest.findFirst({
      where: {
        accessTokenId: accessToken.id,
        status: "PENDING"
      }
    });

    if (existingRequest) {
      return NextResponse.json({ error: "Une demande est déjà en cours de traitement pour ce code." }, { status: 400 });
    }

    // Créer la demande
    const request = await prisma.deviceChangeRequest.create({
      data: {
        companyId: accessToken.companyId,
        customerId: accessToken.assignedCustomerId,
        accessTokenId: accessToken.id,
        oldDeviceId: accessToken.boundDeviceId,
        newDeviceId: parsed.newDeviceId,
      }
    });

    await writeAuditLog({
      companyId: accessToken.companyId,
      action: "DEVICE_CHANGE_REQUESTED",
      entityType: "DeviceChangeRequest",
      message: `Demande de changement d'appareil soumise pour le token ${tokenStr} (nouveau: ${parsed.newDeviceId})`
    });

    return NextResponse.json({ success: true, requestId: request.id }, { status: 201 });

  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Une erreur s'est produite lors de la demande." }, { status: 500 });
  }
}
