"use client";

import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight, Clock, CheckCircle, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

export default function WalletPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchWallet = () => {
    fetch("/api/wallet")
      .then(res => res.json())
      .then(d => {
        if (!d.error) setData(d);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !method || !phone) return alert("Remplissez tous les champs.");
    setWithdrawing(true);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), method, phone })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      alert("Demande envoyée avec succès.");
      setAmount("");
      fetchWallet();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) return <div className="text-white/60 p-4">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Mon Portefeuille (Bizapay)</h1>
        <p className="text-sm text-white/50">Gérez vos commissions et retraits</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Balance Card */}
        <div className="card p-6 border-cyan/20 bg-cyan/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="rounded-xl bg-cyan/20 p-3">
              <Wallet className="h-6 w-6 text-cyan" />
            </div>
            <div>
              <p className="text-sm text-white/60">Solde Disponible</p>
              <h2 className="text-3xl font-bold text-white">{formatCurrency(data?.wallet?.balance || 0, data?.currency)}</h2>
            </div>
          </div>

          <form onSubmit={handleWithdraw} className="mt-6 space-y-4 border-t border-white/5 pt-6">
            <h3 className="text-sm font-medium text-white">Demander un Retrait</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/50">Montant (Min 500)</label>
                <input
                  type="number"
                  min="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-white/50">Méthode</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="">Sélectionner...</option>
                  <option value="Airtel Money">Airtel Money</option>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Orange Money">Orange Money</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-white/50">Numéro de téléphone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={withdrawing}
              className="w-full rounded-xl bg-cyan py-2 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50"
            >
              {withdrawing ? "Traitement..." : "Demander le retrait"}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-medium text-white mb-4">Derniers Retraits</h3>
            {data?.withdrawalRequests?.length === 0 ? (
              <p className="text-sm text-white/50">Aucun retrait.</p>
            ) : (
              <div className="space-y-3">
                {data?.withdrawalRequests?.map((req: any) => (
                  <div key={req.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/10">
                    <div>
                      <p className="text-sm text-white font-medium">{formatCurrency(req.amount, data?.currency)}</p>
                      <p className="text-xs text-white/50">{req.method} - {req.phone}</p>
                    </div>
                    {req.status === "PENDING" && <span className="flex items-center text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full"><Clock className="w-3 h-3 mr-1" /> En attente</span>}
                    {req.status === "APPROVED" && <span className="flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3 mr-1" /> Approuvé</span>}
                    {req.status === "REJECTED" && <span className="flex items-center text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded-full"><XCircle className="w-3 h-3 mr-1" /> Rejeté</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-medium text-white mb-4">Historique des Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white/70">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Source / Référence</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.wallet?.transactions?.map((t: any) => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                      t.type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {t.type === 'CREDIT' ? 'CRÉDIT' : 'DÉBIT'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{t.source === 'ADMIN_TOPUP' ? 'Recharge Admin' : t.source === 'TOKEN_SALE' ? 'Vente de Token' : t.source}</div>
                    <div className="text-white/50 text-xs">{t.reference}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${t.type === 'CREDIT' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount, data?.currency)}
                  </td>
                </tr>
              ))}
              {(!data?.wallet?.transactions || data.wallet.transactions.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">Aucune transaction pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
