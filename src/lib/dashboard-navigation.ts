import { Role } from "@prisma/client";
import { LayoutDashboard, Users, Building2, Server, FileText, CreditCard, Box, LifeBuoy, ShieldCheck, Activity } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: any;
};

export function getNavigationByRole(role: Role): NavItem[] {
  switch (role) {
    case Role.BIZANET_CEO:
      return [
        { title: "NOC", href: "/dashboard/noc", icon: Activity },
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { title: "Companies", href: "/dashboard/companies", icon: Building2 },
        { title: "Routers", href: "/dashboard/routers", icon: Server },
        { title: "Users", href: "/dashboard/users", icon: Users },
        { title: "SaaS Payments", href: "/dashboard/payments", icon: CreditCard },
        { title: "Audit Logs", href: "/dashboard/audit-logs", icon: FileText },
        { title: "Support View", href: "/dashboard/customers", icon: ShieldCheck },
      ];
    case Role.COMPANY_ADMIN:
      return [
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { title: "Clients finaux", href: "/dashboard/customers", icon: Users },
        { title: "Forfaits", href: "/dashboard/plans", icon: Box },
        { title: "Paiements", href: "/dashboard/payments", icon: CreditCard },
        { title: "Subscriptions", href: "/dashboard/subscriptions", icon: FileText },
        { title: "Router Status", href: "/dashboard/routers", icon: Server },
        { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
      ];
    case Role.COMPANY_AGENT:
      return [
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { title: "Mes clients", href: "/dashboard/customers", icon: Users },
        { title: "Paiements", href: "/dashboard/payments", icon: CreditCard },
        { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
      ];
    case Role.BIZANET_SUPPORT:
      return [
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { title: "Companies", href: "/dashboard/companies", icon: Building2 },
        { title: "Routers", href: "/dashboard/routers", icon: Server },
        { title: "Users", href: "/dashboard/users", icon: Users },
        { title: "Audit Logs", href: "/dashboard/audit-logs", icon: FileText },
        { title: "Support View", href: "/dashboard/customers", icon: ShieldCheck },
      ];
    default:
      return [];
  }
}
