"use client";

import { useEffect, useState } from "react";

type RouterItem = {
  id: string;
  companyId: string;
  name: string;
  host: string;
  apiPort: number;
  username: string;
  location: string | null;
  networkMode: string | null;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
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
  companyId: string;
};

const initialForm: RouterFormState = {
  name: "",
  host: "",
  apiPort: "8728",
  username: "",
  password: "",
  confirmPassword: "",
  location: "",
  networkMode: "",
  companyId: "",
};

export default function RoutersPage() {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isCeo, setIsCeo] = useState<boolean>(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRouter, setEditingRouter] = useState<RouterItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState<RouterFormState>(initialForm);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => setIsCeo(d.user?.role === "BIZANET_CEO"))
      .catch(() => {});
  }, []);

  const fetchRouters = async () => {
    const res = await fetch("/api/routers");
    if (!res.ok) {
      setError("Impossible de charger les routers");
      return;
    }
    const data = await res.json();
    setRouters(data.routers || []);
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  const testRouter = async (id: string) => {
    setTestingId(id);
    const res = await fetch(`/api/routers/${id}/test`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setMessage(data.message || "MikroTik connecté avec succès.");
      setError(null);
    } else {
      setError(data.error || "Impossible de joindre MikroTik. Vérifiez IP, port, username, password et accès API.");
      setMessage(null);
    }
    setTestingId(null);
    fetchRouters();
  };

  const openCreateForm = () => {
    setEditingRouter(null);
    setForm(initialForm);
    setShowForm(true);
    setMessage(null);
    setError(null);
  };

  const openEditForm = (router: RouterItem) => {
    setEditingRouter(router);
    setForm({
      name: router.name,
      host: router.host,
      apiPort: String(router.apiPort ?? 8728),
      username: router.username,
      password: "",
      confirmPassword: "",
      location: router.location ?? "",
      networkMode: router.networkMode === "mock" || router.networkMode === "live" ? router.networkMode : "",
      companyId: router.companyId,
    });
    setShowForm(true);
    setMessage(null);
    setError(null);
  };

  const saveRouter = async () => {
    setMessage(null);
    setError(null);

    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setError("Nom, Host/IP et Username sont obligatoires.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Le mot de passe et la confirmation ne correspondent pas.");
      return;
    }

    if (!editingRouter && !form.password.trim()) {
      setError("Le mot de passe est obligatoire à la création.");
      return;
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      host: form.host.trim(),
      apiPort: Number(form.apiPort || 8728),
      username: form.username.trim(),
      location: form.location.trim() || null,
    };
    if (form.networkMode) payload.networkMode = form.networkMode;
    if (isCeo && form.companyId.trim()) payload.companyId = form.companyId.trim();
    if (form.password.trim()) payload.password = form.password;

    const url = editingRouter ? `/api/routers/${editingRouter.id}` : "/api/routers";
    const method = editingRouter ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Impossible d'enregistrer le routeur.");
      setSaving(false);
      return;
    }

    setMessage(editingRouter ? "MikroTik mis à jour." : "MikroTik ajouté.");
    setShowForm(false);
    setEditingRouter(null);
    setForm(initialForm);
    setSaving(false);
    fetchRouters();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Routers</h1>
        <button
          onClick={openCreateForm}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
        >
          Ajouter MikroTik
        </button>
      </div>
      {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">{message}</div> : null}

      {showForm ? (
        <div className="card space-y-4 p-5">
          <h2 className="text-base font-semibold text-white">{editingRouter ? "Modifier MikroTik" : "Ajouter MikroTik"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Nom du routeur" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Host / IP / domaine" value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="API Port" value={form.apiPort} onChange={(e) => setForm((p) => ({ ...p, apiPort: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Username API" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
            <input type="password" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder={editingRouter ? "Nouveau password (optionnel)" : "Password"} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <input type="password" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Confirmer Password" value={form.confirmPassword} onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
            <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Emplacement (optionnel)" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            <select className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" value={form.networkMode} onChange={(e) => setForm((p) => ({ ...p, networkMode: e.target.value as "mock" | "live" | "" }))}>
              <option value="">Mode réseau (auto)</option>
              <option value="live">live</option>
              <option value="mock">mock</option>
            </select>
            {isCeo && !editingRouter ? (
              <input className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white md:col-span-2" placeholder="Company ID (CEO uniquement)" value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))} />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {editingRouter ? (
              <button
                onClick={() => testRouter(editingRouter.id)}
                disabled={testingId === editingRouter.id}
                className="rounded border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-600/30 disabled:opacity-60"
              >
                {testingId === editingRouter.id ? "Test en cours..." : "Tester connexion"}
              </button>
            ) : null}
            <button
              onClick={saveRouter}
              disabled={saving}
              className="rounded border border-emerald-500/30 bg-emerald-600/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div className="card p-5 overflow-x-auto">
        <table className="min-w-[1100px] text-left text-sm">
          <thead className="text-xs uppercase text-white/50">
            <tr>
              <th className="py-2 pr-4">name</th>
              <th className="py-2 pr-4">host</th>
              <th className="py-2 pr-4">port</th>
              <th className="py-2 pr-4">username</th>
              <th className="py-2 pr-4">status</th>
              <th className="py-2 pr-4">lastSeenAt</th>
              <th className="py-2 pr-4">lastError</th>
              <th className="py-2 pr-4">actions</th>
            </tr>
          </thead>
          <tbody>
            {routers.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="py-3 pr-4 text-white/90">{r.name}</td>
                <td className="py-3 pr-4 text-white/70">{r.host}</td>
                <td className="py-3 pr-4 text-white/70">{r.apiPort ?? 8728}</td>
                <td className="py-3 pr-4 text-white/70">{r.username}</td>
                <td className="py-3 pr-4">
                  <span className={`px-2 py-1 rounded text-xs ${r.status === 'ONLINE' ? 'bg-green-500/20 text-green-300' : r.status === 'OFFLINE' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="py-3 pr-4 text-white/70">{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "-"}</td>
                <td className="py-3 pr-4 text-xs text-red-300">{r.lastError || "-"}</td>
                <td className="py-3 pr-4 flex gap-2">
                    <button
                      onClick={() => testRouter(r.id)}
                      disabled={testingId === r.id}
                      className="px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-600/30 transition text-xs"
                    >
                      {testingId === r.id ? "Test..." : "Tester connexion"}
                    </button>
                    <button
                      onClick={() => openEditForm(r)}
                      className="px-3 py-1 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded hover:bg-purple-600/30 transition text-xs"
                    >
                      Modifier
                    </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
