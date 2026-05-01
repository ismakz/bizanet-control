"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Wifi, Navigation } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SuccessPage() {
  const router = useRouter();
  const [data, setData] = useState<{ username: string; expiresAt: string; plan: string } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("bizanet_activation_success");
    if (stored) {
      setData(JSON.parse(stored));
      // Optionnel: nettoyer pour ne pas revoir la page au refresh
      // sessionStorage.removeItem("bizanet_activation_success");
    } else {
      router.push("/portal");
    }
  }, [router]);

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#050A10] text-white flex items-center justify-center p-6">
      <div className="card p-8 text-center space-y-6 max-w-md w-full border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)] bg-[#0B131E]/90 backdrop-blur-xl">
        <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          <CheckCircle className="w-10 h-10" />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Accès Activé !</h1>
          <p className="text-sm text-white/60">Votre connexion internet est maintenant fonctionnelle.</p>
        </div>

        <div className="bg-black/40 rounded-2xl p-5 text-left space-y-4 border border-white/5">
          <div className="flex items-center gap-3 text-cyan">
            <Wifi className="w-5 h-5" />
            <span className="font-semibold">{data.plan}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div>
              <div className="text-xs text-white/40 mb-1">Identifiant</div>
              <div className="font-mono text-white text-sm font-medium">{data.username}</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Valide jusqu'au</div>
              <div className="text-sm text-emerald-400 font-medium">{data.expiresAt}</div>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/50 flex flex-col gap-1">
          <p>L'accès est lié à cet appareil.</p>
          <p>Le réseau peut mettre quelques secondes à s'ouvrir.</p>
        </div>

        <button
          onClick={() => window.location.href = "https://www.google.com"}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-sm font-bold text-white hover:bg-emerald-600 transition shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        >
          Commencer à naviguer <Navigation className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
