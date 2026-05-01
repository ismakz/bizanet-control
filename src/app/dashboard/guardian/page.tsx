"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, XOctagon, Server, Lock, Activity, Users, Globe } from "lucide-react";

export default function GuardianDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/guardian/stats")
      .then(res => {
        if (!res.ok) throw new Error("Accès refusé ou erreur serveur");
        return res.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-white/50 animate-pulse">Chargement Production Guardian...</div>;
  if (error) return <div className="text-red-400 bg-red-500/10 p-4 rounded-xl border border-red-500/20">{error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-cyan/10 text-cyan shadow-neon border border-cyan/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Production Guardian</h1>
            <p className="text-sm text-white/50 mt-1">Supervision globale de la sécurité et de la stabilité</p>
          </div>
        </div>
        
        {data.globalStatus === "HEALTHY" && (
          <div className="px-4 py-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full flex items-center gap-2 text-sm font-bold shadow-[0_0_15px_rgba(34,197,94,0.2)]">
            <ShieldCheck className="w-4 h-4" /> HEALTHY
          </div>
        )}
        {data.globalStatus === "WARNING" && (
          <div className="px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full flex items-center gap-2 text-sm font-bold shadow-[0_0_15px_rgba(249,115,22,0.2)]">
            <AlertTriangle className="w-4 h-4" /> WARNING
          </div>
        )}
        {data.globalStatus === "CRITICAL" && (
          <div className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center gap-2 text-sm font-bold shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse">
            <XOctagon className="w-4 h-4" /> CRITICAL
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Core Systems */}
        <div className="card p-6 border-white/5 space-y-4">
          <div className="flex items-center justify-between text-white/50 mb-2">
            <span className="text-xs uppercase tracking-wider font-bold">Base de données</span>
            <Server className="w-4 h-4 text-cyan" />
          </div>
          <div className="text-2xl font-bold text-white">{data.system.db}</div>
          <div className="text-xs text-white/40">Connexion Prisma</div>
        </div>

        <div className="card p-6 border-white/5 space-y-4">
          <div className="flex items-center justify-between text-white/50 mb-2">
            <span className="text-xs uppercase tracking-wider font-bold">Système Auth</span>
            <Lock className="w-4 h-4 text-cyan" />
          </div>
          <div className="text-2xl font-bold text-white">{data.system.auth}</div>
          <div className="text-xs text-white/40">{data.metrics.loginFailures} échecs récents (24h)</div>
        </div>

        <div className="card p-6 border-white/5 space-y-4">
          <div className="flex items-center justify-between text-white/50 mb-2">
            <span className="text-xs uppercase tracking-wider font-bold">Dernier Cron</span>
            <Activity className="w-4 h-4 text-cyan" />
          </div>
          <div className="text-xl font-bold text-white truncate" title={data.system.lastCronRun}>{data.system.lastCronRun}</div>
          <div className="text-xs text-white/40">Expiration & Activations</div>
        </div>

        <div className="card p-6 border-white/5 space-y-4">
          <div className="flex items-center justify-between text-white/50 mb-2">
            <span className="text-xs uppercase tracking-wider font-bold">Network Mode</span>
            <Globe className="w-4 h-4 text-cyan" />
          </div>
          <div className="text-2xl font-bold text-white uppercase">{data.system.networkMode}</div>
          <div className="text-xs text-white/40">v{data.system.version}</div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mt-12 mb-6">Alertes Métier</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div className={`card p-6 border-t-4 ${data.metrics.offlineRouters > 0 ? 'border-t-red-500' : 'border-t-cyan/30'}`}>
          <div className="text-4xl font-bold text-white mb-2">{data.metrics.offlineRouters}</div>
          <div className="text-sm text-white/60">Routeurs Offline</div>
          {data.metrics.offlineRouters > 0 && <p className="text-xs text-red-400 mt-4">Intervention réseau requise</p>}
        </div>

        <div className={`card p-6 border-t-4 ${data.metrics.failedNetworkJobs > 10 ? 'border-t-orange-500' : 'border-t-cyan/30'}`}>
          <div className="text-4xl font-bold text-white mb-2">{data.metrics.failedNetworkJobs}</div>
          <div className="text-sm text-white/60">Activations Réseau Échouées (24h)</div>
          {data.metrics.failedNetworkJobs > 0 && <p className="text-xs text-orange-400 mt-4">Vérifier communication MikroTik</p>}
        </div>

        <div className={`card p-6 border-t-4 ${data.metrics.suspiciousTokens > 20 ? 'border-t-orange-500' : 'border-t-cyan/30'}`}>
          <div className="text-4xl font-bold text-white mb-2">{data.metrics.suspiciousTokens}</div>
          <div className="text-sm text-white/60">Tokens Suspects (WATCH/BLOCKED)</div>
          {data.metrics.suspiciousTokens > 0 && <p className="text-xs text-orange-400 mt-4">Vérifier tentatives de fraude/revente</p>}
        </div>

      </div>

    </div>
  );
}
