"use client";

import { useState, useEffect, Suspense } from "react";
import { KeyRound, ArrowRight, CheckCircle, Smartphone, AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";

function ActivateTokenForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeviceMismatch, setIsDeviceMismatch] = useState(false);
  const [requestChangeLoading, setRequestChangeLoading] = useState(false);
  const [requestChangeSuccess, setRequestChangeSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ username: string; password: string; expiresAt: string } | null>(null);

  // Get or generate device ID
  const getDeviceId = () => {
    if (typeof window === "undefined") return "";
    let deviceId = localStorage.getItem("bizanet_device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      localStorage.setItem("bizanet_device_id", deviceId);
    }
    return deviceId;
  };

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam.toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token, 
          phone: phone || undefined,
          deviceId: getDeviceId(),
          userAgent: window.navigator.userAgent 
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DEVICE_MISMATCH") {
          setIsDeviceMismatch(true);
          throw new Error("Ce code est déjà lié à un autre appareil.");
        }
        throw new Error(data.error || "Erreur d'activation");
      }

      setSuccessData({
        username: data.username,
        password: data.password,
        expiresAt: new Date(data.expiresAt).toLocaleString()
      });
    } catch (err: any) {
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        setError("Activation impossible pour le moment. Réessayez quand la connexion revient.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeviceChange = async () => {
    setRequestChangeLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/device-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token,
          newDeviceId: getDeviceId() 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la demande");
      setRequestChangeSuccess(true);
      setIsDeviceMismatch(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRequestChangeLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="card p-8 text-center space-y-6 max-w-md mx-auto mt-12 border-cyan/20 shadow-[0_0_50px_rgba(0,242,254,0.1)]">
        <div className="w-16 h-16 bg-cyan/10 text-cyan rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Accès Activé !</h2>
          <p className="text-sm text-white/60">Votre connexion internet est maintenant active.</p>
        </div>

        <div className="bg-black/20 rounded-xl p-4 text-left space-y-3 border border-white/5">
          <div>
            <div className="text-xs text-white/40 mb-1">Nom d'utilisateur (PPPoE/Hotspot)</div>
            <div className="font-mono text-cyan font-medium bg-black/40 px-3 py-2 rounded-lg">{successData.username}</div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1">Mot de passe</div>
            <div className="font-mono text-cyan font-medium bg-black/40 px-3 py-2 rounded-lg">{successData.password}</div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1">Valide jusqu'au</div>
            <div className="text-sm text-white">{successData.expiresAt}</div>
          </div>
        </div>

        <p className="text-xs text-white/40">Veuillez configurer votre routeur avec ces identifiants.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan/10 text-cyan mb-4 shadow-neon">
          <KeyRound className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Activer mon accès</h1>
        <p className="text-sm text-white/50 mt-2">Entrez votre code secret (Token) pour activer votre connexion internet.</p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan/10 text-cyan text-xs font-medium border border-cyan/20">
          <Smartphone className="w-3.5 h-3.5" />
          Votre accès sera strictement lié à cet appareil
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-6 text-center">
          {error}
        </div>
      )}

      {requestChangeSuccess && (
        <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-4 py-4 text-sm text-green-200 mb-6 text-center space-y-2">
          <div className="font-bold flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" /> Demande envoyée
          </div>
          <p>Votre demande de changement d'appareil a été transmise à l'administrateur. Veuillez patienter sa validation puis réessayer.</p>
        </div>
      )}

      {isDeviceMismatch && !requestChangeSuccess && (
        <div className="card p-6 mb-6 border-orange-500/30 bg-orange-500/5 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-orange-400">Appareil non reconnu</h3>
            <p className="text-xs text-orange-200/70 mt-1">
              Ce code d'accès est déjà enregistré sur un autre appareil. Voulez-vous demander un changement d'appareil ?
            </p>
          </div>
          <button
            onClick={handleRequestDeviceChange}
            disabled={requestChangeLoading}
            className="btn-primary w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {requestChangeLoading ? "Envoi de la demande..." : "Demander le changement d'appareil"}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div className="space-y-1">
          <label className="text-xs font-medium text-white/60">Code d'accès (Token)</label>
          <input
            required
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase())}
            placeholder="BN-XXXX-XXXX"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-cyan/50 font-mono text-lg text-center tracking-widest uppercase transition-colors"
          />
        </div>
        
        <div className="space-y-1">
          <label className="text-xs font-medium text-white/60">Téléphone (Optionnel)</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+243..."
            className="form-input text-center"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50"
        >
          {loading ? "Vérification..." : "Activer la connexion"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

export default function ActivateTokenPage() {
  return (
    <Suspense fallback={<div className="text-white/50 text-center mt-12">Chargement...</div>}>
      <ActivateTokenForm />
    </Suspense>
  );
}
