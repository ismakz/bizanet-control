import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { disconnectUser } from "@/lib/mikrotik";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);
    const tenantWhere = getTenantWhere(auth);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        ...tenantWhere
      }
    });

    if (!customer) {
      return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
    }

    if (!customer.routerId) {
      return NextResponse.json({ error: "Ce client n'est associé à aucun routeur." }, { status: 400 });
    }

    // Déconnecter l'utilisateur sur le MikroTik
    await disconnectUser(customer.id);

    // Optionnel: On peut aussi "reset" son boundDeviceId s'il y a un token actif
    const activeToken = await prisma.accessToken.findFirst({
      where: { assignedCustomerId: customer.id, status: "ACTIVE" }
    });

    if (activeToken && activeToken.boundDeviceId) {
      await prisma.customerDevice.updateMany({
        where: { accessTokenId: activeToken.id },
        data: { isActive: false }
      });
      // Ne pas forcément effacer le boundDeviceId, juste forcer une reco.
      // S'ils veulent un vrai reset, ils utiliseront les DeviceRequests.
    }

    await writeAuditLog({
      companyId: customer.companyId,
      actorUserId: auth.userId,
      action: "CUSTOMER_FORCE_DISCONNECTED",
      entityType: "Customer",
      message: `Client ${customer.username} déconnecté de force du réseau.`
    });

    return NextResponse.json({ success: true, message: "Client déconnecté avec succès." }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Erreur lors de la déconnexion." }, { status: 500 });
  }
}
