"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileText, Play } from "lucide-react";

type SubscriptionItem = {
  id: string;
  status: string;
  networkActivationStatus: string;
  startedAt: string;
  expiresAt: string;
  customer: { fullName: string; username: string };
  plan: { name: string };
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions");
      if (!res.ok) throw new Error("Erreur chargement abonnements");
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const retryActivation = async (id: string) => {
    if (!confirm("Voulez-vous réessayer l'activation sur le routeur ?")) return;
    try {
      const res = await fetch(`/api/subscriptions/${id}/retry-activation`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert("Activation réussie !");
        fetchSubscriptions();
      } else {
        alert(`Erreur: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    }
  };

  const columns = [
    { 
      header: "Client", 
      cell: (s: SubscriptionItem) => (
        <div>
          <div className="font-medium text-white">{s.customer.fullName}</div>
          <div className="text-xs text-white/50">{s.customer.username}</div>
        </div>
      )
    },
    { header: "Forfait", cell: (s: SubscriptionItem) => s.plan.name },
    { header: "Statut", cell: (s: SubscriptionItem) => <StatusBadge status={s.status} /> },
    { 
      header: "Réseau (MikroTik)", 
      cell: (s: SubscriptionItem) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
          s.networkActivationStatus === "SUCCESS" ? "bg-green-500/10 text-green-400 border-green-500/20" :
          s.networkActivationStatus === "FAILED" ? "bg-red-500/10 text-red-400 border-red-500/20" :
          "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
        }`}>
          {s.networkActivationStatus}
        </span>
      )
    },
    { header: "Début", cell: (s: SubscriptionItem) => new Date(s.startedAt).toLocaleDateString() },
    { header: "Fin", cell: (s: SubscriptionItem) => new Date(s.expiresAt).toLocaleDateString() },
    {
      header: "Actions",
      cell: (s: SubscriptionItem) => (
        s.networkActivationStatus === "FAILED" ? (
          <button 
            onClick={() => retryActivation(s.id)}
            className="flex items-center gap-1 px-3 py-1 bg-cyan/10 text-cyan border border-cyan/20 rounded-lg hover:bg-cyan/20 transition text-xs font-medium"
          >
            <Play className="w-3 h-3" /> Retry Activation
          </button>
        ) : <span className="text-white/30 text-xs">-</span>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Abonnements</h1>
          <p className="text-sm text-white/50 mt-1">Historique des souscriptions et état du réseau</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <DataTable 
        data={subscriptions} 
        columns={columns} 
        keyExtractor={(s) => s.id} 
        emptyMessage={loading ? "Chargement..." : "Aucun abonnement trouvé"}
      />
    </div>
  );
}
