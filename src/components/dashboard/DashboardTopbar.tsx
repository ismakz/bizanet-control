"use client";

import { LogoutButton } from "@/components/LogoutButton";
import Link from "next/link";
import { KeyRound, Menu, UserCircle } from "lucide-react";

export function DashboardTopbar({
  userName,
  role,
  companyName,
  onMenuClick,
}: {
  userName: string;
  role: string;
  companyName?: string;
  onMenuClick?: () => void;
}) {
  const showCompany =
    role === "COMPANY_ADMIN" && companyName && companyName.trim().length > 0;

  return (
    <header className="sticky top-0 z-10 h-16 border-b border-white/5 bg-[#050A10]/80 backdrop-blur-md flex items-center justify-between px-6">
      <div className="flex items-center gap-4 min-w-0">
        <button
          className="lg:hidden p-2 -ml-2 text-white/70 hover:text-white rounded-lg hover:bg-white/5 transition shrink-0"
          onClick={onMenuClick}
          type="button"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 hidden sm:block">
          <div className="text-sm text-white/80 font-medium">Dashboard</div>
          {showCompany ? (
            <div
              className="text-xs text-cyan truncate max-w-[220px] md:max-w-md"
              title={companyName}
            >
              {companyName}
            </div>
          ) : null}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium text-white">{userName}</div>
          <div className="text-xs text-cyan">{role.replace("_", " ")}</div>
        </div>
        
        <div className="h-8 w-px bg-white/10 mx-2" />
        
        <Link 
          href="/dashboard/profile" 
          className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          title="Mon Profil"
        >
          <UserCircle className="h-4 w-4" />
          <span className="hidden md:inline">Profil</span>
        </Link>
        
        <LogoutButton />
      </div>
    </header>
  );
}
