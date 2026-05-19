"use client";

import { useEffect, useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users, Play, Pause, Plus, Search, LogOut, Router } from "lucide-react";
import Link from "next/link";

type CustomerItem = {
  id: string;
  fullName: string;
  username: string;
  phone: string;
  status: string;
  expiresAt: string;
  routerId: string | null;
  subscriptions?: { id: string; networkActivationStatus: string }[];
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [hotspotLoadingId, setHotspotLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const isCeo = userRole === "BIZANET_CEO";
  const canHotspotAgent =
    userRole === "COMPANY_ADMIN" || userRole === "BIZANET_CEO";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUserRole(d.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const fetchCustomers = async () => {
    const res = await fetch("/api/customers");
    if (!res.ok) {
      setError("Impossible de charger les clients");
      return;
    }
    const data = await res.json();
    setCustomers(data.customers || []);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const activateCustomer = async (id: string) => {
    const planId = prompt("Entrez le planId pour l'activation manuelle (laisser vide pour utiliser le dernier forfait) :");
    const body = planId ? { planId } : {};
    
    const res = await fetch(`/api/customers/${id}/activate`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body) 
    });
    const data = await res.json();
    if (data.success) {
      alert("Activé" + (data.warning ? ` (${data.warning})` : ""));
    } else {
      alert(`Erreur: ${data.error}`);
    }
    fetchCustomers();
  };

  const suspendCustomer = async (id: string) => {
    if (!confirm("Voulez-vous vraiment suspendre ce client ?")) return;
    const res = await fetch(`/api/customers/${id}/suspend`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert("Suspendu" + (data.warning ? ` (${data.warning})` : ""));
    } else {
      alert(`Erreur: ${data.error}`);
    }
    fetchCustomers();
  };

  const retryActivation = async (subscriptionId: string) => {
    const res = await fetch(`/api/subscriptions/${subscriptionId}/retry-activation`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert("Activation réseau réussie !");
      fetchCustomers();
    } else {
      alert(`Erreur: ${data.error}`);
    }
  };

  const disconnectCustomer = async (id: string) => {
    if (!confirm("Voulez-vous vraiment déconnecter ce client du routeur ? Il devra se reconnecter.")) return;
    const res = await fetch(`/api/customers/${id}/disconnect`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert("Client déconnecté avec succès.");
      fetchCustomers();
    } else {
      alert(`Erreur: ${data.error}`);
    }
  };

  const activateOnMikrotikAgent = async (customerId: string) => {
    setHotspotLoadingId(customerId);
    setToast(null);
    try {
      const res = await fetch("/api/hotspot/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customerId, profile: "default" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast({ kind: "ok", text: "Client activé sur MikroTik" });
      } else {
        const msg =
          (typeof data?.error === "string" && data.error) ||
          (typeof data?.message === "string" && data.message) ||
          `Erreur ${res.status}`;
        setToast({ kind: "err", text: msg });
      }
    } catch (e) {
      setToast({
        kind: "err",
        text: e instanceof Error ? e.message : "Erreur réseau",
      });
    } finally {
      setHotspotLoadingId(null);
    }
  };

  const columns = [
    { header: "Nom", accessorKey: "fullName" as const },
    { header: "Téléphone", accessorKey: "phone" as const },
    { header: "Username", accessorKey: "username" as const },
    { 
      header: "Statut", 
      cell: (c: CustomerItem) => <StatusBadge status={c.status} /> 
    },
    { 
      header: "Expire le", 
      cell: (c: CustomerItem) => new Date(c.expiresAt).toLocaleDateString() 
    },
    ...(!isCeo || canHotspotAgent
      ? [
          {
            header: "Actions",
            cell: (c: CustomerItem) => (
              <div className="flex flex-wrap gap-2">
                {canHotspotAgent && (
                  <button
                    type="button"
                    disabled={hotspotLoadingId === c.id}
                    onClick={() => activateOnMikrotikAgent(c.id)}
                    className="flex items-center gap-1 px-3 py-1 bg-cyan/10 text-cyan border border-cyan/25 rounded-lg hover:bg-cyan/20 transition text-xs font-medium disabled:opacity-50"
                    title="Créer l'utilisateur hotspot via BizaNet-Agent (MikroTik)"
                  >
                    <Router className="w-3 h-3" />{" "}
                    {hotspotLoadingId === c.id
                      ? "…"
                      : "Activer sur MikroTik"}
                  </button>
                )}
                {!isCeo && (
                  <>
                    {c.subscriptions?.[0]?.networkActivationStatus ===
                      "FAILED" && (
                      <button
                        onClick={() =>
                          retryActivation(c.subscriptions![0].id)
                        }
                        className="flex items-center gap-1 px-3 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg hover:bg-yellow-500/20 transition text-xs font-medium"
                      >
                        <Play className="w-3 h-3" /> Retry Réseau
                      </button>
                    )}
                    <button
                      onClick={() => activateCustomer(c.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition text-xs font-medium"
                    >
                      <Play className="w-3 h-3" /> Activer
                    </button>
                    <button
                      onClick={() => suspendCustomer(c.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition text-xs font-medium"
                    >
                      <Pause className="w-3 h-3" /> Suspendre
                    </button>
                    <button
                      onClick={() => disconnectCustomer(c.id)}
                      className="flex items-center gap-1 px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg hover:bg-orange-500/20 transition text-xs font-medium"
                      title="Déconnecter la session actuelle"
                    >
                      <LogOut className="w-3 h-3" /> Kick
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]
      : [])
  ];

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = 
        c.fullName.toLowerCase().includes(search.toLowerCase()) || 
        c.username.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search);
      const matchStatus = filterStatus === "ALL" || c.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [customers, search, filterStatus]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Clients Finaux</h1>
            <p className="text-sm text-white/50 mt-1">Gérez vos abonnés internet</p>
          </div>
        </div>
        {!isCeo && (
          <Link 
            href="/dashboard/customers/new"
            className="flex items-center gap-2 rounded-xl bg-cyan px-4 py-2.5 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-neon"
          >
            <Plus className="w-4 h-4" />
            Nouveau Client
          </Link>
        )}
      </div>

      <div className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text"
            placeholder="Rechercher nom, username, téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-cyan/50"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
          {["ALL", "ACTIVE", "EXPIRED", "SUSPENDED"].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                filterStatus === status 
                ? "bg-cyan/10 text-cyan border border-cyan/20" 
                : "bg-white/5 text-white/60 border border-white/5 hover:text-white"
              }`}
            >
              {status === "ALL" ? "Tous" : status}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      <DataTable 
        data={filteredCustomers} 
        columns={columns} 
        keyExtractor={(c) => c.id} 
        emptyMessage="Aucun client enregistré"
      />
    </div>
  );
}
