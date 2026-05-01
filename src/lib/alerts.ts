import { prisma } from "@/lib/prisma";
import { AlertSeverity } from "@prisma/client";

interface CreateAlertParams {
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  companyId?: string;
  routerId?: string;
}

export async function createAlert(params: CreateAlertParams) {
  return prisma.alert.create({
    data: {
      type: params.type,
      severity: params.severity,
      title: params.title,
      message: params.message,
      companyId: params.companyId,
      routerId: params.routerId,
      status: "OPEN",
    }
  });
}

// Helper pour router offline
export async function createRouterOfflineAlert(router: any, errorMsg: string) {
  // Check if open alert already exists
  const existing = await prisma.alert.findFirst({
    where: { routerId: router.id, type: "ROUTER_OFFLINE", status: "OPEN" }
  });
  if (existing) return;

  await createAlert({
    type: "ROUTER_OFFLINE",
    severity: "CRITICAL",
    title: `Routeur hors ligne: ${router.name}`,
    message: `Le routeur ne répond plus. Erreur: ${errorMsg}`,
    companyId: router.companyId,
    routerId: router.id,
  });
}

// Helper pour SaaS proche de l'expiration
export async function createSaaSExpiringAlert(company: any) {
  const existing = await prisma.alert.findFirst({
    where: { companyId: company.id, type: "SAAS_EXPIRING", status: "OPEN" }
  });
  if (existing) return;

  const dateStr = company.saasExpiresAt ? new Date(company.saasExpiresAt).toLocaleDateString() : 'Bientôt';
  await createAlert({
    type: "SAAS_EXPIRING",
    severity: "WARNING",
    title: `SaaS expire bientôt: ${company.name}`,
    message: `L'abonnement SaaS de l'entreprise expire le ${dateStr}.`,
    companyId: company.id,
  });
}
