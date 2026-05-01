"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      return setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
    }
    if (newPassword !== confirmPassword) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expirée. Veuillez vous reconnecter.");
          setTimeout(() => {
            router.push("/login");
          }, 2000);
          return;
        }
        throw new Error(data.error || "Erreur lors du changement.");
      }

      router.push("/dashboard");
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
            <ShieldCheck className="h-7 w-7 text-cyan" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sécurisez votre compte</h1>
          <p className="mt-2 text-center text-sm text-white/50">
            Pour des raisons de sécurité, vous devez modifier votre mot de passe généré automatiquement lors de votre première connexion.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Mot de passe actuel</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Nouveau mot de passe</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/70">Confirmer le nouveau mot de passe</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 transition focus:border-cyan focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-cyan"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-white/50 pt-2 pb-4">
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex items-center gap-1 hover:text-white">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan py-3 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50"
          >
            {loading ? "Mise à jour..." : "Enregistrer et continuer"}
          </button>
        </form>
      </div>
    </div>
  );
}
