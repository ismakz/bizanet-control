"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus } from "lucide-react";
import Link from "next/link";

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    username: "",
    password: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Default expiresAt (today + 1 month) since it's just creation. 
    // The actual duration is handled when a payment is approved.
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status: "PENDING",
          expiresAt: expiresAt.toISOString()
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création");

      router.push("/dashboard/customers");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Ajouter un Client</h1>
            <p className="text-sm text-white/50 mt-1">Créez un nouveau compte d'accès internet</p>
          </div>
        </div>
        <Link href="/dashboard/customers" className="text-sm text-cyan hover:underline">
          Retour à la liste
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-xs text-white/60">Nom Complet</label>
            <input 
              required
              name="fullName"
              value={form.fullName}
              onChange={e => setForm({...form, fullName: e.target.value})}
              className="form-input" 
              placeholder="Jean Dupont"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/60">Téléphone</label>
            <input 
              required
              name="phone"
              value={form.phone}
              onChange={e => setForm({...form, phone: e.target.value})}
              className="form-input" 
              placeholder="+243..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/60">Nom d'utilisateur (PPPoE)</label>
            <input 
              required
              name="username"
              value={form.username}
              onChange={e => setForm({...form, username: e.target.value})}
              className="form-input" 
              placeholder="jean.dupont"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/60">Mot de passe (PPPoE)</label>
            <input 
              required
              type="password"
              name="password"
              minLength={6}
              value={form.password}
              onChange={e => setForm({...form, password: e.target.value})}
              className="form-input" 
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-neon disabled:opacity-50"
        >
          {loading ? "Création en cours..." : "Créer le client"}
        </button>
      </form>
    </div>
  );
}
