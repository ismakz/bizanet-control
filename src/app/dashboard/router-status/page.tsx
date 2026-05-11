"use client";

import { useEffect, useState } from "react";
import { Server, Activity, Clock, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Wifi, Network } from "lucide-react";

type RouterItem = {
  id: string;
  name: string;
  host: string;
  apiPort?: number;
  username: string;
  location?: string | null;
  networkMode?: string | null;
  status: string;
  lastSeenAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RouterFormState = {
  name: string;
  host: string;
  apiPort: string;
  username: string;
  password: string;
  confirmPassword: string;
  location: string;
  networkMode: "mock" | "live" | "";
};

export default function RouterStatusPage() {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingRouter, setEditingRouter] = useState<RouterItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState<RouterFormState>({
    name: "",
    host: "",
    apiPort: "8728",
    username: "",
    password: "",
    confirmPassword: "",
    location: "",
    networkMode: "",
  });

  const fetchRouters = async () => {
    const res = await fetch("/api/routers");
    if (!res.ok) throw new Error("Erreur lors du chargement des routeurs");
    const data = await res.json();
    setRouters(data.routers || []);
  };

  useEffect(() => {
    fetchRouters()
      .then(() => {
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const openEdit = (router: RouterItem) => {
    setEditingRouter(router);
    setForm({
      name: router.name,
      host: router.host,
      apiPort: String(router.apiPort ?? 8728),
      username: router.username,
      password: "",
      confirmPassword: "",
      location: router.location || "",
      networkMode: router.networkMode === "mock" || router.networkMode === "live" ? router.networkMode : "",
    });
    setError(null);
    setMessage(null);
  };

  const closeEdit = () => {
    setEditingRouter(null);
    setSaving(false);
  };

  const saveRouter = async () => {
    if (!editingRouter) return;
    setError(null);
    setMessage(null);

    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setError("Nom, Host/IP et Username sont obligatoires.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Le mot de passe et la confirmation ne correspondent pas.");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      host: form.host.trim(),
      apiPort: Number(form.apiPort || 8728),
      username: form.username.trim(),
      location: form.location.trim() || null,
    };
    if (form.networkMode) payload.networkMode = form.networkMode;
    if (form.password.trim()) payload.password = form.password;

    setSaving(true);
    const res = await fetch(`/api/routers/${editingRouter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Impossible d'enregistrer la configuration routeur.");
      setSaving(false);
      return;
    }
    setMessage("Configuration MikroTik mise à jour avec succès.");
    closeEdit();
    await fetchRouters();
  };

  const testRouter = async (routerId: string) => {
    setTestingId(routerId);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/routers/${routerId}/test`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message || "MikroTik connecté avec succès.");
    } else {
      setError(data.error || "Impossible de joindre MikroTik. Vérifiez IP, port, username, password et accès API.");
    }
    setTestingId(null);
    await fetchRouters();
  };

  if (loading) {
    return <div className="text-white/50">Chargement de l'état du routeur...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (routers.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md p-12 text-center">
        <Server className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-white mb-2">Aucun routeur configuré</h2>
        <p className="text-white/50">Veuillez contacter le support BizaNet pour l'installation initiale de votre routeur MikroTik.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <Server className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">État du Routeur</h1>
          <p className="text-sm text-white/50 mt-1">Surveillez l'état de votre équipement réseau</p>
        </div>
      </div>
      {message ? (
        <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</div>
      ) : null}
      {editingRouter ? (
        <div className="card space-y-4 p-5">
          <h2 className="text-base font-semibold text-white">Modifier MikroTik</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Nom du routeur" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Host / IP / domaine" value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="API Port" value={form.apiPort} onChange={(e) => setForm((p) => ({ ...p, apiPort: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Username API" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
            <input type="password" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Nouveau password (optionnel)" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <input type="password" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Confirmer Password" value={form.confirmPassword} onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Emplacement (optionnel)" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            <select className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" value={form.networkMode} onChange={(e) => setForm((p) => ({ ...p, networkMode: e.target.value as "mock" | "live" | "" }))}>
              <option value="">Mode réseau (auto)</option>
              <option value="live">live</option>
              <option value="mock">mock</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => testRouter(editingRouter.id)}
              disabled={testingId === editingRouter.id}
              className="rounded border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-600/30 disabled:opacity-60"
            >
              {testingId === editingRouter.id ? "Test en cours..." : "Tester connexion"}
            </button>
            <button
              onClick={saveRouter}
              disabled={saving}
              className="rounded border border-emerald-500/30 bg-emerald-600/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              onClick={closeEdit}
              className="rounded border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {routers.map(router => (
          <div key={router.id} className="card p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{router.name}</h3>
                <div className="text-sm text-cyan mt-1 font-mono">{router.host}</div>
              </div>
              <StatusBadge status={router.status} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/60">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">État d'origine</span>
                </div>
                <span className="text-sm text-white">{router.status === "ONLINE" ? "Connecté" : "Déconnecté"}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/60">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Utilisateur API</span>
                </div>
                <span className="text-sm text-white">{router.username}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/60">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Dernière vérification</span>
                </div>
                <span className="text-sm text-white">{new Date(router.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            {router.lastError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-300">
                {router.lastError}
              </div>
            ) : null}

              <div className="pt-4 border-t border-white/5">
                <RouterStats routerId={router.id} />
              </div>

              <div className="pt-4 border-t border-white/5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openEdit(router)}
                    className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs font-medium text-cyan hover:bg-cyan/20 transition"
                  >
                    Modifier config
                  </button>
                  <button
                    onClick={() => testRouter(router.id)}
                    disabled={testingId === router.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 transition disabled:opacity-60"
                  >
                    {testingId === router.id ? "Test..." : "Tester connexion"}
                  </button>
                </div>
              </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouterStats({ routerId }: { routerId: string }) {
  const [stats, setStats] = useState<{wifiCount: number, dhcpCount: number, pppoeCount: number} | null>(null);

  useEffect(() => {
    fetch(`/api/routers/${routerId}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !d.error) setStats(d);
      })
      .catch(() => {});
  }, [routerId]);

  if (!stats) return <div className="text-xs text-white/40 text-center py-2">Chargement statistiques...</div>;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
        <Wifi className="w-4 h-4 text-cyan mx-auto mb-1" />
        <div className="text-lg font-bold text-white">{stats.wifiCount}</div>
        <div className="text-[10px] text-white/50 uppercase">WiFi</div>
      </div>
      <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
        <Network className="w-4 h-4 text-cyan mx-auto mb-1" />
        <div className="text-lg font-bold text-white">{stats.dhcpCount}</div>
        <div className="text-[10px] text-white/50 uppercase">Câble</div>
      </div>
      <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
        <Server className="w-4 h-4 text-cyan mx-auto mb-1" />
        <div className="text-lg font-bold text-white">{stats.pppoeCount}</div>
        <div className="text-[10px] text-white/50 uppercase">PPPoE</div>
      </div>
    </div>
  );
}

