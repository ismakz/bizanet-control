"use client";

import { useState } from "react";
import { PlusCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function TopupModal({ agentId, agentName, currency }: { agentId: string; agentName: string; currency: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Montant invalide");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          amount: Number(amount),
          note
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la recharge");

      setIsOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors border border-white/10"
      >
        <PlusCircle className="w-4 h-4" /> Recharger
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#0A1018] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">Recharger l'Agent</h2>
              <p className="text-sm text-white/50 mb-6">Ajouter des fonds à {agentName}</p>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleTopup} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Montant ({currency})</label>
                  <input 
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan/50"
                    placeholder="Ex: 50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Note / Référence (Optionnel)</label>
                  <input 
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan/50"
                    placeholder="Paiement reçu par M-Pesa..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 text-white font-medium hover:bg-white/10 transition"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-3 rounded-xl bg-cyan text-[#050A10] font-bold hover:bg-cyan/90 transition flex items-center justify-center"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Valider"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
