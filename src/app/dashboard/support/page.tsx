"use client";

import { useState } from "react";
import { Search, ServerCrash, RefreshCw, KeyRound, User, ChevronRight } from "lucide-react";

export default function SupportPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length < 3) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/support/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const retryActivation = async (subscriptionId: string) => {
    try {
      await fetch(`/api/subscriptions/${subscriptionId}/retry-activation`, { method: "POST" });
      alert("Demande de réactivation réseau envoyée au routeur.");
    } catch (err) {
      alert("Erreur lors de la réactivation");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue/10 text-blue">
          <Search className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Support Premium</h1>
          <p className="text-sm text-white/50 mt-1">Recherchez un client ou un token pour diagnostiquer les problèmes.</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-4">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Téléphone, Token (BN-...), Nom..."
          className="form-input flex-1 max-w-xl"
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Recherche..." : "Chercher"}
        </button>
      </form>

      <div className="space-y-4 mt-8">
        {results.length === 0 && !loading && query.length >= 3 && (
          <div className="text-white/40 text-sm">Aucun résultat trouvé pour "{query}".</div>
        )}
        
        {results.map((r, i) => (
          <div key={i} className="card p-6 border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 rounded-lg text-white/50">
                  {r.type === "TOKEN" ? <KeyRound className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{r.title}</h3>
                  <div className="text-sm text-white/50">{r.subtitle}</div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-black/20 rounded-xl border border-white/5 text-xs text-white/70 space-y-2 font-mono overflow-auto">
              <pre>{JSON.stringify(r.details, null, 2)}</pre>
            </div>

            {r.type === "CUSTOMER" && r.details.subscriptions?.[0] && (
               <div className="pt-4 border-t border-white/5 flex gap-4">
                 <button 
                   onClick={() => retryActivation(r.details.subscriptions[0].id)}
                   className="btn-secondary flex items-center gap-2"
                 >
                   <RefreshCw className="w-4 h-4" /> Relancer l'activation réseau
                 </button>
               </div>
            )}
            
            {r.type === "TOKEN" && r.details.riskLevel !== "NORMAL" && (
               <div className="pt-4 border-t border-white/5 flex gap-4">
                 <div className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold flex items-center gap-2">
                   <ServerCrash className="w-4 h-4" /> ALERTE ANTI-FRAUDE : {r.details.riskLevel}
                 </div>
               </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
