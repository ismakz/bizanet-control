"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BizaNetLogo } from "@/components/branding/BizaNetLogo";

export function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Connexion impossible");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#050A10] to-[#0B131E] border border-white/10 flex items-center justify-center p-2 shadow-neon">
            <BizaNetLogo className="h-full w-full object-contain" alt="BizaNet Control" />
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-widest text-white/50">
            BizaNet Control
          </p>
        </div>
        <h1 className="text-2xl font-semibold text-white text-center">Connexion</h1>
        <p className="mt-2 text-sm text-white/60">
          Connectez-vous avec votre numéro de téléphone.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-white/60">phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-cyan/30"
              placeholder="+221..."
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-white/60">password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-cyan/30"
              placeholder="********"
            />
          </label>
          {error ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan/60 to-blue/50 px-4 py-2 text-sm font-semibold text-[#050A10] shadow-neon transition hover:from-cyan/80 hover:to-blue/70 disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-white/60">
            Pas encore de compte ?{" "}
            <a
              href="/register"
              className="text-cyan hover:underline hover:text-cyan/80 transition-colors"
            >
              Demander une inscription
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
