"use client";

import { useEffect, useState } from "react";
import { Server, Activity, Clock, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

type RouterItem = {
  id: string;
  name: string;
  host: string;
  username: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function RouterStatusPage() {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/routers")
      .then(res => {
        if (!res.ok) throw new Error("Erreur lors du chargement des routeurs");
        return res.json();
      })
      .then(data => {
        setRouters(data.routers || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

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

            <div className="pt-4 border-t border-white/5">
              <button 
                onClick={() => alert("Fonctionnalité de redémarrage en cours de développement.")}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition"
              >
                Redémarrer le routeur
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
