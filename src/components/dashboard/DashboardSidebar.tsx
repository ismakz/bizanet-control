"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, Server, FileText, CreditCard, Box, LifeBuoy, ShieldCheck, ClipboardList, Wallet, X, KeyRound, Zap, UserCircle, Smartphone, Settings } from "lucide-react";
import { BizaNetLogo } from "@/components/branding/BizaNetLogo";

const roleNavMap: Record<string, any[]> = {
  BIZANET_CEO: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Demandes d'inscription", href: "/dashboard/registration-requests", icon: ClipboardList },
    { title: "Companies", href: "/dashboard/companies", icon: Building2 },
    { title: "Routers", href: "/dashboard/routers", icon: Server },
    { title: "Users", href: "/dashboard/users", icon: Users },
    { title: "SaaS Payments", href: "/dashboard/payments", icon: CreditCard },
    { title: "Audit Logs", href: "/dashboard/audit-logs", icon: FileText },
    { title: "Retraits Bizapay", href: "/dashboard/withdrawals", icon: Wallet },
    { title: "Demandes Appareils", href: "/dashboard/device-requests", icon: Smartphone },
    { title: "Support View", href: "/dashboard/customers", icon: ShieldCheck },
  ],
  BIZANET_SUPPORT: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Companies", href: "/dashboard/companies", icon: Building2 },
    { title: "Routers", href: "/dashboard/routers", icon: Server },
    { title: "Audit Logs", href: "/dashboard/audit-logs", icon: FileText },
    { title: "Support View", href: "/dashboard/customers", icon: ShieldCheck },
  ],
  COMPANY_ADMIN: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Vente rapide ⚡", href: "/dashboard/quick-sale", icon: Zap },
    { title: "Agents", href: "/dashboard/agents", icon: UserCircle },
    { title: "Tokens", href: "/dashboard/tokens", icon: KeyRound },
    { title: "Clients", href: "/dashboard/customers", icon: Users },
    { title: "Forfaits", href: "/dashboard/plans", icon: Box },
    { title: "Paiements", href: "/dashboard/payments", icon: CreditCard },
    { title: "Abonnements", href: "/dashboard/subscriptions", icon: FileText },
    { title: "Routeur", href: "/dashboard/router-status", icon: Server },
    { title: "Demandes Appareils", href: "/dashboard/device-requests", icon: Smartphone },
    { title: "Paramètres Entreprise", href: "/dashboard/company-settings", icon: Settings },
    { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
  ],
  COMPANY_AGENT: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Vente rapide ⚡", href: "/dashboard/quick-sale", icon: Zap },
    { title: "Mes tickets", href: "/dashboard/tokens", icon: KeyRound },
    { title: "Mon Portefeuille", href: "/dashboard/wallet", icon: Wallet },
    { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
  ]
};

export function DashboardSidebar({ role, companyName, isOpen, setIsOpen }: { role: string, companyName?: string, isOpen?: boolean, setIsOpen?: (v: boolean) => void }) {
  const pathname = usePathname();
  const navItems = roleNavMap[role] || [];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden" 
          onClick={() => setIsOpen?.(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 border-r border-white/5 bg-[#0B131E] flex flex-col z-30 transition-transform duration-300 lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#050A10] to-[#0B131E] shadow-neon flex items-center justify-center overflow-hidden p-0.5">
            <BizaNetLogo className="w-full h-full object-contain" alt="BizaNet Control" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] text-white/50 tracking-wider uppercase">BizaNet Control</div>
            <div className="text-sm font-semibold text-white/90 truncate max-w-[140px]" title={companyName || "Global Admin"}>
              {companyName || "Command Center"}
            </div>
          </div>
          {/* Close button for mobile */}
          <button className="lg:hidden text-white/50 hover:text-white" onClick={() => setIsOpen?.(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/dashboard");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? "bg-cyan/10 text-cyan border border-cyan/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" 
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan" : "text-white/40"}`} />
              {item.title}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/5 text-xs text-white/40 text-center">
        BizaNet v2.0 &copy; 2026
      </div>
      </aside>
    </>
  );
}
