"use client";

import { useState } from "react";
import { LifeBuoy, Send, MessageSquare } from "lucide-react";

export default function SupportPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulation de l'envoi du ticket (à connecter avec l'API BizaNet plus tard)
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setSubject("");
      setMessage("");
    }, 1500);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue/10 text-blue">
          <LifeBuoy className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Support Technique</h1>
          <p className="text-sm text-white/50 mt-1">Contactez l'équipe BizaNet pour toute assistance</p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-6 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 text-green-400 mb-2">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-medium text-white">Message envoyé avec succès</h3>
          <p className="text-sm text-white/60">Notre équipe de support technique vous répondra dans les plus brefs délais.</p>
          <button 
            onClick={() => setSuccess(false)}
            className="mt-4 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition"
          >
            Envoyer un autre message
          </button>
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/60">Sujet de votre demande</label>
              <input
                required
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Problème d'activation réseau..."
                className="form-input"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-white/60">Description détaillée</label>
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Décrivez votre problème en détail pour nous aider à le résoudre rapidement..."
                className="form-input min-h-[150px] resize-y"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-white/5">
            <button
              type="submit"
              disabled={loading || !subject || !message}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white hover:bg-blue/90 transition shadow-[0_0_15px_rgba(79,172,254,0.3)] disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {loading ? "Envoi en cours..." : "Envoyer la demande"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex gap-4">
        <LifeBuoy className="w-5 h-5 text-white/40 flex-shrink-0" />
        <div className="space-y-1 text-sm text-white/60">
          <p>Le support BizaNet est disponible du lundi au samedi, de 8h à 18h (GMT+1).</p>
          <p>En cas d'urgence hors de ces horaires, veuillez contacter votre gestionnaire de compte directement par téléphone.</p>
        </div>
      </div>
    </div>
  );
}
