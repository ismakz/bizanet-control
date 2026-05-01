import { prisma } from "@/lib/prisma";

export type HealthScore = {
  score: number;
  label: "Excellent" | "Bon" | "Risque" | "Critique";
  reasons: string[];
};

export async function calculateCompanyHealthScore(companyId: string): Promise<HealthScore> {
  let score = 100;
  const reasons: string[] = [];

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      routers: true,
      customers: true,
      payments: {
        where: { status: "PENDING" }
      },
      networkJobs: {
        where: { status: "FAILED" }
      }
    }
  });

  if (!company) {
    return { score: 0, label: "Critique", reasons: ["Company introuvable"] };
  }

  // 1. Router Offline
  const offlineRouters = company.routers.filter(r => r.status === "OFFLINE");
  if (offlineRouters.length > 0) {
    score -= 30;
    reasons.push(`${offlineRouters.length} routeur(s) hors ligne (-30)`);
  }

  // 2. SaaS Expires Soon
  if (company.saasExpiresAt) {
    const daysUntilExpiry = (company.saasExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry < 0) {
      score -= 40;
      reasons.push(`Abonnement SaaS expiré depuis ${Math.abs(Math.round(daysUntilExpiry))} jours (-40)`);
    } else if (daysUntilExpiry <= 7) {
      score -= 20;
      reasons.push(`Abonnement SaaS expire dans ${Math.round(daysUntilExpiry)} jours (-20)`);
    }
  } else {
    // Si pas de date, c'est louche
    score -= 10;
    reasons.push(`Aucune date d'expiration SaaS (-10)`);
  }

  // 3. Failed Network Jobs (Activations, Suspensions)
  if (company.networkJobs.length > 0) {
    score -= 20;
    reasons.push(`${company.networkJobs.length} action(s) réseau en échec (-20)`);
  }

  // 4. Pending Payments
  if (company.payments.length > 5) {
    score -= 10;
    reasons.push(`${company.payments.length} paiements en attente (-10)`);
  }

  // 5. Expired Customers Proportion
  const totalCustomers = company.customers.length;
  if (totalCustomers > 0) {
    const expiredCustomers = company.customers.filter(c => c.status === "EXPIRED").length;
    const expiredRatio = expiredCustomers / totalCustomers;
    if (expiredRatio > 0.2) { // plus de 20% expirés
      score -= 10;
      reasons.push(`Plus de 20% des clients sont expirés (-10)`);
    }
  }

  // Bounds
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  let label: "Excellent" | "Bon" | "Risque" | "Critique";
  if (score >= 90) label = "Excellent";
  else if (score >= 70) label = "Bon";
  else if (score >= 50) label = "Risque";
  else label = "Critique";

  return { score, label, reasons };
}
