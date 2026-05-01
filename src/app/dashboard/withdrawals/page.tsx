"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { Wallet, CheckCircle, XCircle, Clock } from "lucide-react";

export default function WithdrawalsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWithdrawals = () => {
    // We will create this API route shortly
    fetch("/api/withdrawals")
      .then(res => res.json())
      .then(d => {
        if (!d.error) setData(d.requests || []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    if (!confirm(`Voulez-vous vraiment ${action === "approve" ? "approuver" : "rejeter"} ce retrait ?`)) return;

    try {
      const res = await fetch(`/api/withdrawals/${id}/${action}`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      alert(`Retrait ${action === "approve" ? "approuvé" : "rejeté"} avec succès.`);
      fetchWithdrawals();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="text-white/60 p-4">Chargement...</div>;

  const pending = data.filter(r => r.status === "PENDING");
  const history = data.filter(r => r.status !== "PENDING");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Retraits Bizapay (CEO Control)</h1>
        <p className="text-sm text-white/50">Gérez les demandes de retrait des agents.</p>
      </div>

      <div className="card p-6 border-yellow-400/20 bg-yellow-400/5">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-400" />
          Demandes en attente
        </h3>
        
        {pending.length === 0 ? (
          <p className="text-sm text-white/50">Aucune demande en attente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white/70">
              <thead className="bg-white/5 text-xs uppercase text-white/50">
                <tr>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Méthode / Tel</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pending.map(req => (
                  <tr key={req.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{req.user?.fullName || "Inconnu"}</div>
                      <div className="text-xs text-white/50">{req.user?.phone}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{formatCurrency(req.amount, req.user?.company?.currency)}</td>
                    <td className="px-4 py-3">
                      <div>{req.method}</div>
                      <div className="text-xs text-white/50">{req.phone}</div>
                    </td>
                    <td className="px-4 py-3">{new Date(req.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleAction(req.id, "approve")}
                        className="rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1 text-xs font-medium transition"
                      >
                        Approuver
                      </button>
                      <button
                        onClick={() => handleAction(req.id, "reject")}
                        className="rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1 text-xs font-medium transition"
                      >
                        Rejeter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-medium text-white mb-4">Historique des Traitements</h3>
        {history.length === 0 ? (
          <p className="text-sm text-white/50">Aucun historique.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white/70">
              <thead className="bg-white/5 text-xs uppercase text-white/50">
                <tr>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Traité le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map(req => (
                  <tr key={req.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">{req.user?.fullName || req.user?.phone}</td>
                    <td className="px-4 py-3">{formatCurrency(req.amount, req.user?.company?.currency)}</td>
                    <td className="px-4 py-3">
                      {req.status === "APPROVED" && <span className="text-emerald-400 text-xs font-medium bg-emerald-400/10 px-2 py-1 rounded-full">Approuvé</span>}
                      {req.status === "REJECTED" && <span className="text-red-400 text-xs font-medium bg-red-400/10 px-2 py-1 rounded-full">Rejeté</span>}
                    </td>
                    <td className="px-4 py-3">{req.processedAt ? new Date(req.processedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
