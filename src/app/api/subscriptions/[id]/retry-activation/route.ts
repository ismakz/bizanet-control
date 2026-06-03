import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.COMPANY_AGENT, Role.BIZANET_SUPPORT]);

    const subscription = await prisma.internetSubscription.findUnique({
      where: { id: params.id },
      include: { customer: true }
    });

    if (!subscription) return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
    
    assertCompanyAccess(auth, subscription.companyId);

    if (subscription.networkActivationStatus === "SUCCESS") {
      return NextResponse.json({ error: "L'activation réseau est déjà un succès." }, { status: 400 });
    }

    try {
      const { activateUser, createHotspotUser } = await import("@/lib/mikrotik");
      await createHotspotUser(subscription.customerId);
      const { connected, status } = await activateUser(subscription.customerId);

      await prisma.internetSubscription.update({
        where: { id: subscription.id },
        data: { networkActivationStatus: connected ? "SUCCESS" : "PENDING" },
      });

      await writeAuditLog({
        auth,
        companyId: subscription.companyId,
        action: "RETRY_ACTIVATION_SUCCESS",
        entityType: "InternetSubscription",
        message: connected
          ? `Session hotspot active pour ${subscription.customer.username}.`
          : `Hotspot activé pour ${subscription.customer.username}, en attente de connexion (statut: ${status}).`,
      });

      const message = connected
        ? "Session hotspot active — client connecté."
        : `Utilisateur hotspot activé. En attente de connexion WiFi (statut: ${status}).`;

      return NextResponse.json({ success: true, connected, status, message });
    } catch (error: any) {
      await writeAuditLog({
        auth,
        companyId: subscription.companyId,
        action: "RETRY_ACTIVATION_FAILED",
        entityType: "InternetSubscription",
        message: `Nouvelle tentative d'activation échouée pour ${subscription.customer.username}: ${error.message}`,
      });

      return NextResponse.json({ error: `Échec de l'activation : ${error.message}` }, { status: 500 });
    }
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: e.message || "Erreur interne" }, { status: 500 });
  }
}
