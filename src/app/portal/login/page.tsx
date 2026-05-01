"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";

export default function PortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      router.push("/portal");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050A10] p-4 font-sans text-white">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/5 bg-[#0B131E]/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute -left-32 -top-32 h-64 w-64 rounded-full bg-cyan/10 blur-[80px]" />
        
        <div className="relative mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan/10 shadow-neon">
            <User className="h-7 w-7 text-cyan" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Espace Client BizaNet</h1>
          <p className="mt-2 text-center text-sm text-white/50">Connectez-vous pour voir votre abonnement</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Numéro de Téléphone</label>
            <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Code / Mot de passe</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan py-3 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition disabled:opacity-50 mt-4">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
