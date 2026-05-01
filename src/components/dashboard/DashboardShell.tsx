"use client";

import { ReactNode, useState } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";

interface DashboardShellProps {
  children: ReactNode;
  userName: string;
  role: string;
  companyName?: string;
}

export function DashboardShell({ children, userName, role, companyName }: DashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="h-screen bg-[#050A10] flex overflow-hidden">
      {/* Sidebar (Desktop & Mobile) */}
      <DashboardSidebar 
        role={role} 
        companyName={companyName} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <DashboardTopbar 
          userName={userName} 
          role={role} 
          onMenuClick={() => setIsSidebarOpen(true)} 
        />
        
        <main className="flex-1 p-4 md:p-8 overflow-y-auto relative">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
