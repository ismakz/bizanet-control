"use client";

import { useEffect, useState } from "react";
import { Zap, CheckCircle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDuration } from "@/lib/time";
import { TokenReceiptModal } from "@/components/dashboard/TokenReceiptModal";
import { PaymentMethod } from "@prisma/client";

export default function QuickSalePage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [routers, setRouters] = useState<any[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentWarning, setAgentWarning] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    planId: "",
    routerId: "",
    paymentMethod: PaymentMethod.CASH as PaymentMethod
  });

  const [generatedToken, setGeneratedToken] = useState<any | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [plansRes, routersRes] = await Promise.all([
          fetch("/api/plans"),
          fetch("/api/routers")
        ]);

        if (!plansRes.ok) throw new Error("Erreur de chargement des forfaits");
        const plansData = await plansRes.json();
        setPlans(plansData.plans || []);
        if (plansData.currency) setCurrency(plansData.currency);

        if (routersRes.ok) {
          const routersData = await routersRes.json();
          setRouters(routersData.routers || []);
          if (routersData.routers?.length === 1) {
            setForm(f => ({ ...f, routerId: routersData.routers[0].id }));
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.planId) return setError("Veuillez sélectionner un forfait.");
    
    setSelling(true);
    setError(null);
    setAgentWarning(null);

    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: form.planId,
          quantity: 1,
          routerId: form.routerId || undefined,
          markAsPaid: true,
          paymentMethod: form.paymentMethod,
          isQuickSale: true
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la vente");

      setGeneratedToken(data.tokens[0]);
      if (data.agentMessage) setAgentWarning(data.agentMessage);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSelling(false);
    }
  };

  if (loading) {
    return <div className="text-white/50 text-center mt-12">Chargement...</div>;
  }

  return (
    <div className="max-w-md mx-auto space-y-8 mt-4 sm:mt-8">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-16 h-16 bg-cyan/10 text-cyan rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,242,254,0.15)]">
          <Zap className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Vente Rapide</h1>
          <p className="text-sm text-white/50 mt-1">Vendez un accès en 1 clic</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSale} className="card p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/60">Sélectionner un forfait</label>
            <select
              required
              value={form.planId}
              onChange={e => setForm({...form, planId: e.target.value})}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-white text-lg font-medium outline-none focus:border-cyan/50 transition-colors"
            >
              <option value="" disabled className="bg-[#050A10]">-- Choisir --</option>
              {plans.map(p => (
                <option key={p.id} value={p.id} className="bg-[#050A10]">
                  {p.name} - {formatCurrency(p.price, currency)} ({formatDuration(p.durationValue, p.durationUnit)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/60">Méthode de paiement</label>
            <select
              required
              value={form.paymentMethod}
              onChange={e => setForm({...form, paymentMethod: e.target.value as PaymentMethod})}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan/50 transition-colors"
            >
              <option value="CASH" className="bg-[#050A10]">Espèces (Cash)</option>
              <option value="MOBILE_MONEY" className="bg-[#050A10]">Mobile Money</option>
              <option value="BANK_TRANSFER" className="bg-[#050A10]">Virement Bancaire</option>
            </select>
          </div>

          {routers.length > 1 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/60">Routeur (Optionnel)</label>
              <select
                value={form.routerId}
                onChange={e => setForm({...form, routerId: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan/50 transition-colors"
              >
                <option value="" className="bg-[#050A10]">Auto-assignation</option>
                {routers.map(r => (
                  <option key={r.id} value={r.id} className="bg-[#050A10]">
                    {r.name} ({r.host})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={selling || !form.planId}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-4 text-lg font-bold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_20px_rgba(0,242,254,0.3)] disabled:opacity-50"
        >
          {selling ? "Création en cours..." : "Vendre maintenant"}
          <ArrowRight className="w-5 h-5" />
        </button>
      </form>

      {agentWarning ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 text-center">
          {agentWarning}
        </p>
      ) : null}

      {generatedToken && (
        <TokenReceiptModal 
          tokenData={generatedToken} 
          onClose={() => {
            setGeneratedToken(null);
            setAgentWarning(null);
          }} 
        />
      )}
    </div>
  );
}
