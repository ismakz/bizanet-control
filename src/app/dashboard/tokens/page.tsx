"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { KeyRound, Plus, Copy, Printer, Download, Layers } from "lucide-react";
import Link from "next/link";
import { formatDuration } from "@/lib/time";
import { TokenReceiptModal } from "@/components/dashboard/TokenReceiptModal";
import { BatchTokenPrintModal } from "@/components/dashboard/BatchTokenPrintModal";
import { DurationUnit } from "@prisma/client";

type TokenItem = {
  id: string;
  token: string;
  status: string;
  price: string;
  currency: string;
  createdAt: string;
  plan: { name: string; durationValue: number; durationUnit: DurationUnit; downloadLimitMbps?: number; uploadLimitMbps?: number };
  assignedCustomer?: { fullName: string; username: string } | null;
  generatedByUser: { fullName: string };
  company: { name: string; city: string; ownerPhone?: string };
};

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenItem | null>(null);
  const [showBatchPrint, setShowBatchPrint] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) throw new Error("Erreur lors du chargement des tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
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
        t.status,
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
        if (t.status === "UNUSED") color = "bg-cyan/10 text-cyan border-cyan/20";
        if (t.status === "ACTIVE" || t.status === "USED") color = "bg-green-500/10 text-green-400 border-green-500/20";
        if (t.status === "EXPIRED" || t.status === "CANCELLED") color = "bg-red-500/10 text-red-400 border-red-500/20";
        
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
            {t.status}
          </span>
        );
      }
    },
    { header: "Prix", cell: (t: TokenItem) => `${t.price} ${t.currency}` },
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
