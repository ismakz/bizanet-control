"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CURRENCIES } from "@/config/currencies";

export default function CreateCompanyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reqId = searchParams.get("reqId");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    ownerPhone: "",
    country: "",
    city: "",
    address: "",
    currency: "USD",
    saasPlan: "",
    saasExpiresAt: "",
    adminFullName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
    adminConfirmPassword: "",
    mustChangePassword: false,
    routerName: "",
    routerHost: "",
    routerUsername: "",
    routerPassword: "",
  });

  useEffect(() => {
    if (reqId) {
      setLoading(true);
      fetch(`/api/registration-requests/${reqId}`)
        .then(res => res.json())
        .then(data => {
          if (data.request) {
            setFormData(prev => ({
              ...prev,
              companyName: data.request.companyName || "",
              ownerName: data.request.ownerName || "",
              ownerPhone: data.request.phone || "",
              country: data.request.country || "",
              city: data.request.city || "",
              address: data.request.address || "",
              adminEmail: data.request.email || "",
            }));
          }
        })
        .finally(() => setLoading(false));
    }
  }, [reqId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const matchedCurrencies = CURRENCIES.filter((c) =>
    c.countries.some((ctry) => formData.country.toLowerCase().includes(ctry.toLowerCase()))
  );
  
  const currenciesToShow = matchedCurrencies.length > 0
    ? Array.from(new Set([...matchedCurrencies, ...CURRENCIES.filter(c => c.countries.includes("Global"))]))
    : CURRENCIES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (formData.adminPassword !== formData.adminConfirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      setLoading(false);
      return;
    }

    if (formData.adminPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        reqId: reqId || undefined, // Send reqId if available to link the approval
      };

      const res = await fetch("/api/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      setSuccessData({
        phone: formData.adminPhone,
        password: formData.adminPassword,
        companyId: data.company.id
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="card p-8 text-center space-y-6 border-emerald-500/20 bg-emerald-500/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Entreprise et compte admin créés avec succès !</h2>
            <p className="text-sm text-white/60">Veuillez conserver ces identifiants en lieu sûr. Ils ne seront affichés qu'une seule fois.</p>
          </div>

          <div className="bg-[#050A10] p-4 rounded-xl border border-white/5 space-y-3 text-left">
            <div>
              <span className="text-xs text-white/50 uppercase tracking-wider">Téléphone de connexion</span>
              <div className="text-lg font-mono text-white select-all">{successData.phone}</div>
            </div>
            <div>
              <span className="text-xs text-white/50 uppercase tracking-wider">Mot de passe temporaire</span>
              <div className="text-lg font-mono text-white select-all">{successData.password}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`Téléphone: ${successData.phone}\nMot de passe: ${successData.password}`);
                alert("Identifiants copiés !");
              }}
              className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20 transition"
            >
              Copier les identifiants
            </button>
            <button
              onClick={() => {
                router.push(`/dashboard/companies/${successData.companyId}`);
                router.refresh();
              }}
              className="rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition"
            >
              Aller au tableau de bord de l'entreprise
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-white">Créer une entreprise</h1>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white">Company Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/50">Company Name</label>
              <input name="companyName" required value={formData.companyName} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Owner Name</label>
              <input name="ownerName" required value={formData.ownerName} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Owner Phone</label>
              <input name="ownerPhone" required value={formData.ownerPhone} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Country</label>
              <input name="country" required value={formData.country} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">City</label>
              <input name="city" required value={formData.city} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Address</label>
              <input name="address" value={formData.address} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Monnaie (Currency)</label>
              <select name="currency" value={formData.currency} onChange={handleChange} className="form-select">
                {currenciesToShow.map(c => (
                  <option key={c.code} value={c.code}>{c.label} ({c.symbol})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Plan SaaS BizaNet</label>
              <input name="saasPlan" value={formData.saasPlan} onChange={handleChange} className="form-input" placeholder="ex: Pro, Elite" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Date d'expiration SaaS</label>
              <input type="date" name="saasExpiresAt" value={formData.saasExpiresAt} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </div>

        {/* Admin Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white">COMPANY_ADMIN Credentials</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/50">Full Name</label>
              <input name="adminFullName" required value={formData.adminFullName} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Email (Optional)</label>
              <input type="email" name="adminEmail" value={formData.adminEmail} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Phone</label>
              <input name="adminPhone" required value={formData.adminPhone} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Mot de passe</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} name="adminPassword" required minLength={6} value={formData.adminPassword} onChange={handleChange} className="form-input pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2 text-white/50 hover:text-white">
                  {showPassword ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Confirmer le mot de passe</label>
              <input type={showPassword ? "text" : "password"} name="adminConfirmPassword" required minLength={6} value={formData.adminConfirmPassword} onChange={handleChange} className="form-input" />
            </div>
          </div>
          <div className="pt-2">
            <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.mustChangePassword}
                onChange={(e) => setFormData({ ...formData, mustChangePassword: e.target.checked })}
                className="rounded border-white/10 bg-white/5 text-cyan focus:ring-cyan focus:ring-offset-0"
              />
              Obliger le changement de mot de passe à la première connexion
            </label>
          </div>
        </div>

        {/* Router Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white">MikroTik Router (Optional)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/50">Router Name</label>
              <input name="routerName" value={formData.routerName} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Host (IP or DNS)</label>
              <input name="routerHost" value={formData.routerHost} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Username</label>
              <input name="routerUsername" value={formData.routerUsername} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Password</label>
              <input type="password" name="routerPassword" value={formData.routerPassword} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] transition hover:bg-cyan/90 disabled:opacity-50"
        >
          {loading ? "Onboarding in progress..." : "Complete Onboarding"}
        </button>
      </form>
    </div>
  );
}
