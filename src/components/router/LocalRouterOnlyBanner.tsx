"use client";

import { Server } from "lucide-react";
import { LOCAL_ROUTER_UI_MESSAGE } from "@/lib/router-access-client";

export function LocalRouterOnlyBanner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex items-start gap-3 ${className}`}
      role="status"
    >
      <Server className="w-5 h-5 shrink-0 mt-0.5 text-amber-300" />
      <p>{LOCAL_ROUTER_UI_MESSAGE}</p>
    </div>
  );
}
