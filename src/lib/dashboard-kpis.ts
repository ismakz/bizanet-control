import { prisma } from "@/lib/prisma";
import { AuthContext } from "@/lib/permissions";
import { Role, CustomerStatus, PaymentStatus } from "@prisma/client";

export async function getCeoKpis() {
  const [companiesTotal, companiesActive, companiesSuspended, routersTotal, routersOnline, customersTotal, paymentsPending] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.company.count({ where: { status: "SUSPENDED" } }),
    prisma.router.count(),
    prisma.router.count({ where: { status: "ONLINE" } }),
    prisma.customer.count(),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);

  // Simulate monthly revenue for now
  const saasRevenueMonth = 1500; 

  return {
    companiesTotal,
    companiesActive,
    companiesSuspended,
    saasRevenueMonth,
    routersTotal,
    routersOnline,
    customersTotal,
    paymentsPending
  };
}

export async function getAdminKpis(auth: AuthContext) {
  if (!auth.companyId) throw new Error("COMPANY_ID_REQUIRED");

  const [customersActive, customersExpired, customersSuspended, plansTotal, paymentsPending] = await Promise.all([
    prisma.customer.count({ where: { companyId: auth.companyId, status: CustomerStatus.ACTIVE } }),
    prisma.customer.count({ where: { companyId: auth.companyId, status: CustomerStatus.EXPIRED } }),
    prisma.customer.count({ where: { companyId: auth.companyId, status: CustomerStatus.SUSPENDED } }),
    prisma.plan.count({ where: { companyId: auth.companyId } }),
    prisma.payment.count({ where: { companyId: auth.companyId, status: PaymentStatus.PENDING } }),
  ]);

  // Simulate local revenue for now
  const revenueDay = 50000;
  const revenueMonth = 1500000;

  const routers = await prisma.router.findMany({ where: { companyId: auth.companyId } });
  const routerOnline = routers.some(r => r.status === "ONLINE");

  return {
    customersActive,
    customersExpired,
    customersSuspended,
    revenueDay,
    revenueMonth,
    paymentsPending,
    plansTotal,
    routerOnline
  };
}
