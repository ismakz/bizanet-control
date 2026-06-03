"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, CheckCircle, ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { formatDuration } from "@/lib/time";
import { TokenReceiptModal } from "@/components/dashboard/TokenReceiptModal";

export default function GenerateTokensPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentWarning, setAgentWarning] = useState<string | null>(null);
  const [successTokens, setSuccessTokens] = useState<any[]>([]);
  const [selectedTokenToPrint, setSelectedTokenToPrint] = useState<any | null>(null);

  const [form, setForm] = useState({
    planId: "",
    quantity: 1,
    markAsPaid: false,
    paymentMethod: "CASH"
  });

  useEffect(() => {
    fetch("/api/plans")
      .then(res => res.json())
      .then(data => {
        setPlans(data.plans || []);
        if (data.currency) setCurrency(data.currency);
        if (data.plans && data.plans.length > 0) {
          setForm(prev => ({ ...prev, planId: data.plans[0].id }));
        }
        setLoading(false);
      })
      .catch(err => {
        setError("Erreur lors du chargement des forfaits");
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setAgentWarning(null);

    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Erreur de génération");

      setSuccessTokens(data.tokens);
      if (data.agentMessage) setAgentWarning(data.agentMessage);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="text-white/50">Chargement...</div>;
  }

  if (successTokens.length > 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="card p-8 text-center space-y-4 border-cyan/20 shadow-neon">
          <div className="w-16 h-16 bg-cyan/10 text-cyan rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Génération Réussie !</h2>
          <p className="text-white/60">{successTokens.length} token(s) ont été créés avec succès.</p>
          {agentWarning ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {agentWarning}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {successTokens.map((t, idx) => (
            <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-4 text-center flex flex-col justify-between">
              <div className="space-y-2 mb-4">
                <div className="font-mono text-xl text-cyan font-semibold tracking-widest">{t.token}</div>
                <div className="text-xs text-white/60 mb-1">Type: {t.plan.accessType}</div>
                <div className="text-xs text-white/40">Montant : {t.price} {t.currency}</div>
              </div>
              <button 
                onClick={() => setSelectedTokenToPrint(t)}
                className="flex items-center justify-center gap-2 w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-white transition border border-white/10"
              >
                <Printer className="w-3 h-3" /> Imprimer le reçu
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-4 pt-4">
          <button 
            onClick={() => {
              const text = successTokens.map(t => t.token).join("\n");
              navigator.clipboard.writeText(text);
              alert("Tous les codes ont été copiés dans le presse-papier");
            }}
            className="px-6 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition"
          >
            Copier tous les codes
          </button>
          <Link 
            href="/dashboard/tokens"
            className="px-6 py-2.5 rounded-xl bg-cyan text-[#050A10] font-semibold hover:bg-cyan/90 transition shadow-neon"
          >
            Voir la liste
          </Link>
        </div>
        {selectedTokenToPrint && (
          <TokenReceiptModal 
            tokenData={selectedTokenToPrint} 
            onClose={() => setSelectedTokenToPrint(null)} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/tokens" className="p-2.5 rounded-xl bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <KeyRound className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Générer des Tokens</h1>
          <p className="text-sm text-white/50 mt-1">Créez des codes d'accès prépayés</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/60">Forfait Internet</label>
            <select
              value={form.planId}
              onChange={e => setForm({...form, planId: e.target.value})}
              className="form-select"
            >
              <option value="" disabled className="bg-[#050A10]">-- Sélectionner --</option>
              {plans.map(p => (
                <option key={p.id} value={p.id} className="bg-[#050A10]">
                  [{p.accessType}] {p.name} - {formatCurrency(p.price, currency)} ({formatDuration(p.durationValue, p.durationUnit)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/60">Quantité à générer</label>
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 50, 100].map(qty => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => setForm({...form, quantity: qty})}
                  className={`py-2 rounded-lg text-sm font-medium transition ${
                    form.quantity === qty 
                    ? "bg-cyan/10 text-cyan border border-cyan/30" 
                    : "bg-white/5 text-white/60 border border-transparent hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={form.markAsPaid}
                onChange={e => setForm({...form, markAsPaid: e.target.checked})}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-cyan focus:ring-cyan focus:ring-offset-0"
              />
              <span className="text-sm font-medium text-white/80">Marquer ces tokens comme payés immédiatement</span>
            </label>

            {form.markAsPaid && (
              <div className="space-y-1 pl-7">
                <label className="text-xs font-medium text-white/60">Méthode d'encaissement</label>
                <select
                  value={form.paymentMethod}
                  onChange={e => setForm({...form, paymentMethod: e.target.value})}
                  className="form-select"
                >
                  <option value="CASH" className="bg-[#050A10]">💵 Espèces (Cash)</option>
                  <option value="AIRTEL_MONEY" className="bg-[#050A10]">🔴 Airtel Money</option>
                  <option value="MPESA" className="bg-[#050A10]">🟢 M-Pesa</option>
                  <option value="ORANGE_MONEY" className="bg-[#050A10]">🟠 Orange Money</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={generating || !form.planId}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-neon disabled:opacity-50"
        >
          {generating ? "Génération en cours..." : `Générer ${form.quantity} token(s)`}
        </button>
      </form>
    </div>
  );
}
