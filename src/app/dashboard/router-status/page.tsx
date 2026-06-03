"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Activity,
  Clock,
  Users,
  LogOut,
  PauseCircle,
  CheckCircle,
  Eye,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LocalRouterOnlyBanner } from "@/components/router/LocalRouterOnlyBanner";
import {
  fetchRouterAccessMode,
  LOCAL_ROUTER_UI_MESSAGE,
  type RouterAccessMode,
} from "@/lib/router-access-client";
import { AGENT_OFFLINE_MESSAGE } from "@/lib/mikrotik-agent";
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
  const [routerAccess, setRouterAccess] = useState<RouterAccessMode | null>(null);
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
    fetchRouterAccessMode().then(setRouterAccess).catch(() => null);
    fetchRouters()
      .then(() => {
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (editingRouter) {
      console.log("[ROUTER CONFIG] modal rendered");
    }
  }, [editingRouter]);

  const openEdit = (router: RouterItem) => {
    console.log("[ROUTER CONFIG] button clicked");
    console.log("[ROUTER CONFIG] modal opening");
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
    const raw = await res.text();
    const data = (() => {
      try {
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {
          ok: false,
          error: "Réponse API invalide (non JSON)",
          details: raw.slice(0, 180),
        };
      }
    })();
    if (!res.ok) {
      setError(data.error || data.details || "Impossible d'enregistrer la configuration routeur.");
      setSaving(false);
      return;
    }
    setMessage("Configuration MikroTik mise à jour avec succès.");
    closeEdit();
    await fetchRouters();
  };

  const testRouter = async (routerId: string) => {
    if (routerAccess?.cloudRouterBlocked) {
      setMessage(null);
      setError(LOCAL_ROUTER_UI_MESSAGE);
      return;
    }
    setTestingId(routerId);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/routers/${routerId}/test`, { method: "POST" });
    const data = await res.json();
    if (data.localOnly) {
      setError(data.message || LOCAL_ROUTER_UI_MESSAGE);
      setMessage(null);
    } else if (res.ok && data.success !== false) {
      setMessage(data.message || "MikroTik connecté avec succès.");
    } else {
      setError(data.error || data.message || "Impossible de joindre MikroTik. Vérifiez IP, port, username, password et accès API.");
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
      {routerAccess?.cloudRouterBlocked ? <LocalRouterOnlyBanner /> : null}
      {message ? (
        <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</div>
      ) : null}
      {editingRouter ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card w-full max-w-3xl space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
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
                <RouterStats
                  routerId={router.id}
                  cloudRouterBlocked={routerAccess?.cloudRouterBlocked ?? false}
                />
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

function RouterStats({
  routerId,
  cloudRouterBlocked,
}: {
  routerId: string;
  cloudRouterBlocked: boolean;
}) {
  const [stats, setStats] = useState<{
    success: boolean;
    wifiClients: number;
    ethernetClients: number;
    pppoeClients: number;
    hotspotActive: number;
    errors: string[];
    devices: {
      id: string;
      sessionId: string | null;
      device: string;
      ip: string | null;
      mac: string | null;
      connectionType: "WIFI" | "ETHERNET" | "PPPOE";
      uptime: string | null;
      username: string | null;
      rxBytes: number | null;
      txBytes: number | null;
    }[];
  }>({
    success: true,
    wifiClients: 0,
    ethernetClients: 0,
    pppoeClients: 0,
    hotspotActive: 0,
    errors: [],
    devices: [],
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [syncState, setSyncState] = useState<"LIVE" | "ERREUR">("LIVE");
  const [reloadTick, setReloadTick] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<{
    id: string;
    sessionId: string | null;
    device: string;
    ip: string | null;
    mac: string | null;
    connectionType: "WIFI" | "ETHERNET" | "PPPOE";
    uptime: string | null;
    username: string | null;
    rxBytes: number | null;
    txBytes: number | null;
  } | null>(null);

  useEffect(() => {
    if (cloudRouterBlocked) {
      setHasLoadedOnce(true);
      setSyncState("ERREUR");
      setErrorMessage(LOCAL_ROUTER_UI_MESSAGE);
      setStats({
        success: false,
        wifiClients: 0,
        ethernetClients: 0,
        pppoeClients: 0,
        hotspotActive: 0,
        errors: [LOCAL_ROUTER_UI_MESSAGE],
        devices: [],
      });
      return;
    }

    let mounted = true;
    const load = () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      return fetch(`/api/router/live-stats?routerId=${encodeURIComponent(routerId)}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          const payload = await r.json().catch(() => null);
          if (!r.ok) {
            const msg = payload?.error || `HTTP ${r.status}`;
            throw new Error(msg);
          }
          return payload;
        })
        .then((d) => {
          if (!mounted || !d) return;
          setStats(d);
          setLastUpdatedAt(new Date());
          setHasLoadedOnce(true);
          if (d.localOnly) {
            setSyncState("ERREUR");
            setErrorMessage(d.message || LOCAL_ROUTER_UI_MESSAGE);
          } else if (
            d.message === AGENT_OFFLINE_MESSAGE ||
            d.errors?.includes(AGENT_OFFLINE_MESSAGE)
          ) {
            setSyncState("ERREUR");
            setErrorMessage(AGENT_OFFLINE_MESSAGE);
          } else if (d.success === false || (Array.isArray(d.errors) && d.errors.length > 0)) {
            setSyncState("ERREUR");
            setErrorMessage(d.error || d.errors?.[0] || "Sync partielle");
          } else {
            setSyncState("LIVE");
            setErrorMessage(null);
          }
        })
        .catch((err) => {
          if (!mounted) return;
          setHasLoadedOnce(true);
          setStats((prev) => prev ?? {
            success: false,
            wifiClients: 0,
            ethernetClients: 0,
            pppoeClients: 0,
            hotspotActive: 0,
            errors: [],
            devices: [],
          });
          setSyncState("ERREUR");
          setErrorMessage(err?.name === "AbortError" ? "Timeout API (6s)" : err?.message || "Erreur sync routeur");
        })
        .finally(() => clearTimeout(timeoutId));
    };

    load();
    const timer = setInterval(load, 10_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [routerId, reloadTick, cloudRouterBlocked]);

  const runDeviceAction = async (
    endpoint: "disconnect" | "suspend" | "reactivate",
    d: {
      id: string;
      sessionId: string | null;
      ip: string | null;
      mac: string | null;
      connectionType: "WIFI" | "ETHERNET" | "PPPOE";
      username: string | null;
    }
  ) => {
    if (cloudRouterBlocked) {
      setToast({ kind: "err", text: LOCAL_ROUTER_UI_MESSAGE });
      setErrorMessage(LOCAL_ROUTER_UI_MESSAGE);
      return;
    }
    if (endpoint === "disconnect" && d.connectionType === "ETHERNET") {
      setToast({ kind: "err", text: "Action impossible sur câble Ethernet" });
      return;
    }
    if (endpoint === "disconnect" && !confirm("Confirmer la déconnexion de cet appareil ?")) return;
    if (endpoint === "suspend" && !confirm("Confirmer la suspension de cet utilisateur ?")) return;
    if (endpoint === "reactivate" && !confirm("Confirmer la réactivation de cet utilisateur ?")) return;

    setActionLoadingId(d.id);
    setToast(null);
    try {
      const res = await fetch(`/api/router/devices/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routerId,
          type: d.connectionType,
          user: d.username,
          mac: d.mac,
          ip: d.ip,
          sessionId: d.sessionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.localOnly) {
        setSyncState("ERREUR");
        setErrorMessage(data.message || LOCAL_ROUTER_UI_MESSAGE);
        setToast({ kind: "err", text: data.message || LOCAL_ROUTER_UI_MESSAGE });
        return;
      }
      if (!res.ok || data.success === false) {
        setSyncState("ERREUR");
        setErrorMessage(data.error || data.message || "Action impossible");
        setToast({ kind: "err", text: data.error || data.message || "Action impossible" });
        return;
      }
      setErrorMessage(null);
      setSyncState("LIVE");
      if (endpoint === "disconnect") setToast({ kind: "ok", text: "Appareil déconnecté" });
      if (endpoint === "suspend") setToast({ kind: "ok", text: "Utilisateur suspendu" });
      if (endpoint === "reactivate") setToast({ kind: "ok", text: "Utilisateur réactivé" });
      setReloadTick((v) => v + 1);
    } catch (e: any) {
      setSyncState("ERREUR");
      setErrorMessage(e?.message || "Erreur action appareil");
      setToast({ kind: "err", text: e?.message || "Erreur action appareil" });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!hasLoadedOnce) return <div className="text-xs text-white/40 text-center py-2">Chargement statistiques...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <div className="text-xs text-white/70">
          Dernière mise à jour :{" "}
          <span className="font-medium text-white">
            {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("fr-FR", { hour12: false }) : "--:--:--"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {syncState === "ERREUR" ? (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              Sync échouée
            </span>
          ) : null}
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              syncState === "LIVE"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {syncState}
          </span>
        </div>
      </div>
      {errorMessage ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {errorMessage}
        </div>
      ) : null}
      {toast ? (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
          <Wifi className="w-4 h-4 text-cyan mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{stats.wifiClients}</div>
          <div className="text-[10px] text-white/50 uppercase">WiFi</div>
        </div>
        <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
          <Network className="w-4 h-4 text-cyan mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{stats.ethernetClients}</div>
          <div className="text-[10px] text-white/50 uppercase">Câble</div>
        </div>
        <div className="bg-black/30 rounded-lg p-2 text-center border border-white/5">
          <Server className="w-4 h-4 text-cyan mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{stats.pppoeClients}</div>
          <div className="text-[10px] text-white/50 uppercase">PPPoE</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-7 gap-2 bg-white/5 px-3 py-2 text-[10px] uppercase text-white/50">
          <span>Appareil</span>
          <span>IP</span>
          <span>MAC</span>
          <span>Type</span>
          <span>Uptime</span>
          <span>User/Token</span>
          <span>Actions</span>
        </div>
        <div className="max-h-52 overflow-auto">
          {stats.devices.length === 0 ? (
            <div className="px-3 py-3 text-xs text-white/40">Aucun appareil connecté</div>
          ) : (
            stats.devices.map((d) => (
              <div key={d.id} className="grid grid-cols-7 gap-2 px-3 py-2 text-xs text-white border-t border-white/5">
                <span className="truncate">{d.device}</span>
                <span className="truncate">{d.ip || "-"}</span>
                <span className="truncate">{d.mac || "-"}</span>
                <span>{d.connectionType}</span>
                <span>{d.uptime || "-"}</span>
                <span className="truncate">{d.username || "-"}</span>
                <div className="flex flex-wrap gap-1">
                  {actionLoadingId === d.id ? (
                    <span className="inline-flex items-center rounded border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Action...
                    </span>
                  ) : null}
                  <button
                    onClick={() => runDeviceAction("disconnect", d)}
                    disabled={actionLoadingId === d.id}
                    className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-200 disabled:opacity-40 inline-flex items-center"
                    title={d.connectionType === "ETHERNET" ? "Non applicable" : "Déconnecter"}
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => runDeviceAction("suspend", d)}
                    disabled={actionLoadingId === d.id || !d.username}
                    className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200 disabled:opacity-40 inline-flex items-center"
                    title="Suspendre"
                  >
                    <PauseCircle className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => runDeviceAction("reactivate", d)}
                    disabled={actionLoadingId === d.id || !d.username}
                    className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200 disabled:opacity-40 inline-flex items-center"
                    title="Réactiver"
                  >
                    <CheckCircle className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setSelectedDevice(d)}
                    disabled={actionLoadingId === d.id}
                    className="rounded border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[10px] text-cyan disabled:opacity-40 inline-flex items-center"
                    title="Détails"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedDevice ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0B131E] p-4 text-white space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Détails appareil</h3>
              <button onClick={() => setSelectedDevice(null)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="rounded border border-white/10 bg-white/5 p-2">
                <div className="text-white/60 mb-1">Identité</div>
                <div>Appareil: <span className="text-white/80">{selectedDevice.device}</span></div>
                <div>User/Token: <span className="text-white/80">{selectedDevice.username || "-"}</span></div>
              </div>
              <div className="rounded border border-white/10 bg-white/5 p-2">
                <div className="text-white/60 mb-1">Connexion</div>
                <div>Type: <span className="text-white/80">{selectedDevice.connectionType}</span></div>
                <div>IP: <span className="text-white/80">{selectedDevice.ip || "-"}</span></div>
                <div>MAC: <span className="text-white/80">{selectedDevice.mac || "-"}</span></div>
                <div>Uptime: <span className="text-white/80">{selectedDevice.uptime || "-"}</span></div>
              </div>
              <div className="rounded border border-white/10 bg-white/5 p-2">
                <div className="text-white/60 mb-1">Trafic</div>
                <div>RX: <span className="text-white/80">{selectedDevice.rxBytes ?? 0}</span></div>
                <div>TX: <span className="text-white/80">{selectedDevice.txBytes ?? 0}</span></div>
              </div>
              <div className="rounded border border-white/10 bg-white/5 p-2">
                <div className="text-white/60 mb-1">Routeur</div>
                <div>Routeur: <span className="text-white/80">{routerId}</span></div>
                <div>Dernière mise à jour: <span className="text-white/80">
                  {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("fr-FR", { hour12: false }) : "--:--:--"}
                </span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

