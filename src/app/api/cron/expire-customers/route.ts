import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  // Optionnel: vérifier un token secret passé dans l'URL (ex: ?key=CRON_SECRET) pour sécuriser l'appel
  try {
    const now = new Date();
    
    // Trouver toutes les souscriptions expirées qui sont encore ACTIVE
    const expiredSubscriptions = await prisma.internetSubscription.findMany({
      where: {
        expiresAt: { lt: now },
        status: "ACTIVE"
      },
      include: { customer: true, company: true }
    });

    let suspendedCount = 0;
    let failedCount = 0;

    // TODO: Dynamic import to avoid edge runtime issues if this was edge, but it's node.
    const { suspendUser } = await import("@/lib/mikrotik");

    for (const sub of expiredSubscriptions) {
      let mikrotikFailed = false;
      let errorMsg = "";
      try {
        // Suspend sur MikroTik
        await suspendUser(sub.customerId);
      } catch (error: any) {
        mikrotikFailed = true;
        errorMsg = error.message;
        console.error(`Erreur CRON MikroTik pour sub ${sub.id}:`, error);
      }

      try {
        // Mettre à jour la DB (transaction atomique)
        await prisma.$transaction(async (tx) => {
          await tx.internetSubscription.update({
            where: { id: sub.id },
            data: { status: "EXPIRED" }
          });

          await tx.customer.update({
            where: { id: sub.customerId },
            data: { status: "EXPIRED" }
          });

          if (mikrotikFailed) {
            await tx.auditLog.create({
              data: {
                companyId: sub.companyId,
                action: "CRON_SUSPENSION_FAILED",
                entityType: "Customer",
                message: `CRON: Abonnement expiré pour ${sub.customer.username} mais impossible de suspendre MikroTik. Erreur: ${errorMsg}`,
              }
            });
            failedCount++;
          } else {
            await tx.auditLog.create({
              data: {
                companyId: sub.companyId,
                action: "CUSTOMER_EXPIRED_CRON",
                entityType: "Customer",
                message: `Abonnement expiré pour le client ${sub.customer.username}. Coupure MikroTik effectuée.`,
              }
            });
            suspendedCount++;
          }
        });
      } catch (dbError: any) {
        console.error(`Erreur CRON DB pour sub ${sub.id}:`, dbError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: expiredSubscriptions.length, 
      suspended: suspendedCount, 
      failed: failedCount 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
