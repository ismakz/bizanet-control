"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { KeyRound, Plus, Copy, Printer, Download, Layers, RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatDuration } from "@/lib/time";
import { TokenReceiptModal } from "@/components/dashboard/TokenReceiptModal";
import { BatchTokenPrintModal } from "@/components/dashboard/BatchTokenPrintModal";
import { DurationUnit } from "@prisma/client";
import { LocalRouterOnlyBanner } from "@/components/router/LocalRouterOnlyBanner";
import {
  fetchRouterAccessMode,
  LOCAL_ROUTER_UI_MESSAGE,
  type RouterAccessMode,
} from "@/lib/router-access-client";

type TokenItem = {
  id: string;
  token: string;
  status: string;
  displayStatus?: "UNUSED" | "ACTIVE" | "OFFLINE" | "EXPIRED";
  price: string;
  currency: string;
  createdAt: string;
  startedAt?: string | null;
  expiresAt?: string | null;
  remainingMs?: number | null;
  remainingSeconds?: number | null;
  isOnline?: boolean;
  consumedSeconds?: number;
  boundDeviceId?: string | null;
  mikrotikState?: string;
  plan: { name: string; durationValue: number; durationUnit: DurationUnit; downloadLimitMbps?: number; uploadLimitMbps?: number };
  assignedCustomer?: { fullName: string; username: string } | null;
  generatedByUser: { fullName: string };
  company: { name: string; city: string; ownerPhone?: string; logoUrl?: string | null };
};

function formatRemaining(ms?: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms <= 0) return "Expiré";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}j ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenItem | null>(null);
  const [showBatchPrint, setShowBatchPrint] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());
  const [remainingBaselineAt, setRemainingBaselineAt] = useState(Date.now());
  const [routerAccess, setRouterAccess] = useState<RouterAccessMode | null>(null);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) throw new Error("Erreur lors du chargement des tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
      setRemainingBaselineAt(Date.now());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouterAccessMode().then(setRouterAccess).catch(() => null);
    fetchTokens();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Token copié : " + text);
  };

  const handleExportCSV = async () => {
    const csvContent = [
      ["Token", "Forfait", "Durée", "Prix", "Statut", "Date de création"].join(","),
      ...tokens.map(t => [
        t.token,
        `"${t.plan.name}"`,
        `"${formatDuration(t.plan.durationValue, t.plan.durationUnit)}"`,
        `${t.price} ${t.currency}`,
        t.displayStatus || t.status,
        new Date(t.createdAt).toLocaleDateString()
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `tokens_bizanet_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Audit log
    await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "TOKEN_EXPORTED", entityType: "AccessToken", message: `Export de ${tokens.length} tokens` })
    }).catch(console.error);
  };

  const handleBatchPrint = async () => {
    const unusedTokens = tokens.filter(t => t.status === "UNUSED");
    if (unusedTokens.length === 0) {
      alert("Aucun token UNUSED à imprimer.");
      return;
    }
    setShowBatchPrint(true);
    
    // Audit log
    await fetch("/api/audit/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "TOKEN_PRINTED", entityType: "AccessToken", message: `Impression en lot de ${unusedTokens.length} tokens UNUSED` })
    }).catch(console.error);
  };

  const handleSyncMikrotik = async () => {
    if (routerAccess?.cloudRouterBlocked) {
      alert(LOCAL_ROUTER_UI_MESSAGE);
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/hotspot/sync");
      const data = await res.json();
      if (data.localOnly) {
        alert(data.message || LOCAL_ROUTER_UI_MESSAGE);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Erreur de synchronisation");
      await fetchTokens();
      alert(
        `Sync termine: ${data.result?.checked ?? 0} verifies, ${data.result?.started ?? 0} demarres, ${data.result?.expired ?? 0} expires.`
      );
    } catch (e: any) {
      alert(e.message || "Erreur synchronisation MikroTik");
    } finally {
      setSyncing(false);
    }
  };

  const columns = [
    { 
      header: "Token / Code", 
      cell: (t: TokenItem) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-cyan font-medium tracking-wider">{t.token}</span>
          <button onClick={() => copyToClipboard(t.token)} className="text-white/40 hover:text-white transition">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      )
    },
    { header: "Forfait", cell: (t: TokenItem) => `${t.plan.name} (${formatDuration(t.plan.durationValue, t.plan.durationUnit)})` },
    { 
      header: "Statut", 
      cell: (t: TokenItem) => {
        let color = "bg-white/10 text-white border-white/20";
        const uiStatus = t.displayStatus || "UNUSED";
        if (uiStatus === "UNUSED") color = "bg-cyan/10 text-cyan border-cyan/20";
        if (uiStatus === "ACTIVE") color = "bg-green-500/10 text-green-400 border-green-500/20";
        if (uiStatus === "OFFLINE") color = "bg-amber-500/10 text-amber-300 border-amber-500/20";
        if (uiStatus === "EXPIRED") color = "bg-red-500/10 text-red-400 border-red-500/20";
        
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
            {uiStatus}
          </span>
        );
      }
    },
    { header: "Prix", cell: (t: TokenItem) => `${t.price} ${t.currency}` },
    {
      header: "Temps restant",
      cell: (t: TokenItem) => {
        const uiStatus = t.displayStatus || "UNUSED";
        if (uiStatus === "EXPIRED") {
          return <span className="text-xs text-red-300">Expiré</span>;
        }
        const isOnline = t.mikrotikState === "ONLINE" || t.isOnline;
        const elapsedSinceLoad = Math.max(0, tickNow - remainingBaselineAt);
        const safeRemainingMs = t.remainingMs ?? 0;
        const dynamicRemaining = isOnline
          ? Math.max(0, safeRemainingMs - elapsedSinceLoad)
          : safeRemainingMs;
        return <span className="text-xs text-white/90">{formatRemaining(dynamicRemaining)}</span>;
      }
    },
    {
      header: "Connecte depuis",
      cell: (t: TokenItem) =>
        t.startedAt ? (
          <span className="text-xs text-white/90">{new Date(t.startedAt).toLocaleString()}</span>
        ) : (
          <span className="text-white/30 text-xs">-</span>
        )
    },
    {
      header: "Expire a",
      cell: (t: TokenItem) =>
        t.expiresAt ? (
          <span className="text-xs text-white/90">{new Date(t.expiresAt).toLocaleString()}</span>
        ) : (
          <span className="text-white/30 text-xs">-</span>
        )
    },
    {
      header: "Etat MikroTik",
      cell: (t: TokenItem) => (
        <div className="flex flex-col">
          <span className="text-xs text-white/90">{t.mikrotikState || "UNKNOWN"}</span>
          <span className="text-[10px] text-white/40">{t.boundDeviceId || "-"}</span>
        </div>
      )
    },
    { 
      header: "Utilisé par", 
      cell: (t: TokenItem) => t.assignedCustomer ? (
        <div>
          <div className="text-xs text-white/90">{t.assignedCustomer.fullName}</div>
          <div className="text-[10px] text-white/40">{t.assignedCustomer.username}</div>
        </div>
      ) : <span className="text-white/30 text-xs">-</span>
    },
    { header: "Date création", cell: (t: TokenItem) => new Date(t.createdAt).toLocaleDateString() },
    {
      header: "Action",
      cell: (t: TokenItem) => (
        <button 
          onClick={() => setSelectedToken(t)}
          className="text-white/40 hover:text-white transition"
          title="Imprimer le reçu"
        >
          <Printer className="w-4 h-4" />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-8">
      {routerAccess?.cloudRouterBlocked ? <LocalRouterOnlyBanner /> : null}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Access Tokens</h1>
            <p className="text-sm text-white/50 mt-1">Gérez les codes d'accès internet vendus</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
          <button 
            onClick={handleBatchPrint}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            <Layers className="w-4 h-4" />
            Imprimer lot
          </button>
          <button
            onClick={handleSyncMikrotik}
            disabled={syncing}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            Synchroniser MikroTik
          </button>
          <Link 
            href="/dashboard/tokens/generate"
            className="flex items-center gap-2 rounded-xl bg-cyan px-4 py-2.5 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-neon"
          >
            <Plus className="w-4 h-4" />
            Générer
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <DataTable 
        data={tokens} 
        columns={columns} 
        keyExtractor={(t) => t.id} 
        emptyMessage={loading ? "Chargement des tokens..." : "Aucun token généré."}
      />

      {selectedToken && (
        <TokenReceiptModal 
          tokenData={selectedToken} 
          onClose={() => setSelectedToken(null)} 
        />
      )}

      {showBatchPrint && (
        <BatchTokenPrintModal 
          tokens={tokens.filter(t => t.status === "UNUSED")}
          onClose={() => setShowBatchPrint(false)}
        />
      )}
    </div>
  );
}
