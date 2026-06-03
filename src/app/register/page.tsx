"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { BizaNetLogo } from "@/components/branding/BizaNetLogo";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    phone: "",
    email: "",
    country: "",
    city: "",
    address: "",
    estimatedCustomers: "",
    message: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        estimatedCustomers: formData.estimatedCustomers ? parseInt(formData.estimatedCustomers, 10) : undefined
      };

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <div className="card p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
            <Rocket className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold text-white">Demande envoyée !</h2>
          <p className="text-white/60 text-sm">
            Votre demande a bien été enregistrée. Notre équipe (BizaNet CEO) va l'examiner et vous recontacter très prochainement.
          </p>
          <button 
            onClick={() => router.push("/login")}
            className="mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 transition"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#050A10] to-[#0B131E] border border-white/10 shadow-neon flex items-center justify-center p-2">
          <BizaNetLogo className="w-full h-full object-contain" alt="BizaNet Control" />
        </div>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Rejoignez BizaNet</h1>
        <p className="mt-2 text-white/60">
          Vous possédez un routeur Starlink et souhaitez gérer vos abonnés ?<br />
          Demandez votre compte BizaNet Control.
        </p>
      </div>

      <div className="card p-6 md:p-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Nom de l'entreprise *</label>
              <input name="companyName" required value={formData.companyName} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Nom du propriétaire *</label>
              <input name="ownerName" required value={formData.ownerName} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Téléphone (WhatsApp) *</label>
              <input name="phone" required placeholder="+221..." value={formData.phone} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Email (Optionnel)</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Pays *</label>
              <input name="country" required value={formData.country} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">Ville *</label>
              <input name="city" required value={formData.city} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-white/60">Adresse (Optionnel)</label>
              <input name="address" value={formData.address} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-white/60">Nombre estimé de clients (Optionnel)</label>
              <input type="number" name="estimatedCustomers" placeholder="Ex: 50" value={formData.estimatedCustomers} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-white/60">Message supplémentaire (Optionnel)</label>
              <textarea name="message" rows={3} value={formData.message} onChange={handleChange} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan/50 focus:ring-1 focus:ring-cyan/50 outline-none transition resize-none" placeholder="Parlez-nous de votre projet..."></textarea>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50 shadow-[0_0_15px_rgba(0,242,254,0.2)]"
          >
            {loading ? "Envoi en cours..." : "Soumettre la demande"}
          </button>
        </form>
      </div>
      
      <div className="mt-6 text-center">
        <a href="/login" className="text-sm text-white/60 hover:text-white transition">
          Retour à la page de connexion
        </a>
      </div>
    </div>
  );
}
