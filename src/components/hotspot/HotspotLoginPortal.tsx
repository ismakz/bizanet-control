"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wifi, Loader2 } from "lucide-react";

/** POST natif vers le routeur MikroTik (pas d’API Next.js). */
const MIKROTIK_LOGIN_ACTION =
  process.env.NEXT_PUBLIC_MIKROTIK_LOGIN_ACTION || "http://192.168.88.1/login";

const DEFAULT_DST = "http://neverssl.com";

function HotspotLoginForm() {
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  const urlUsername = searchParams.get("username")?.trim().toUpperCase() || "";
  const urlPassword = searchParams.get("password")?.trim() || "";
  const hasAutoLogin = Boolean(urlUsername);

  const [username, setUsername] = useState(urlUsername);
  const [password, setPassword] = useState(urlPassword || urlUsername);
  const [status, setStatus] = useState<"connecting" | "manual">(
    hasAutoLogin ? "connecting" : "manual"
  );
  const [error, setError] = useState<string | null>(null);

  const dst =
    searchParams.get("dst") ||
    searchParams.get("link-orig") ||
    DEFAULT_DST;

  useEffect(() => {
    const u = searchParams.get("username")?.trim().toUpperCase() || "";
    const p = searchParams.get("password")?.trim() || "";

    if (u) setUsername(u);
    if (p) setPassword(p);
    else if (u) setPassword(u);

    if (!u) {
      setStatus("manual");
      return;
    }

    if (autoSubmitted.current) return;
    autoSubmitted.current = true;
    setStatus("connecting");

    const t = window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 400);

    return () => window.clearTimeout(t);
  }, [searchParams]);

  return (
    <div className="w-full max-w-md bg-[#0B131E]/90 border border-white/10 rounded-3xl p-8 shadow-2xl text-center space-y-6">
      <div className="w-16 h-16 mx-auto bg-cyan/10 rounded-2xl flex items-center justify-center text-cyan">
        <Wifi className="w-8 h-8" />
      </div>

      <div>
        <h1 className="text-2xl font-bold">EMMANUEL NET</h1>
        <p className="text-sm text-white/60 mt-2">
          Connexion Internet
        </p>
      </div>

      {status === "connecting" && (
        <div className="flex items-center justify-center gap-2 text-cyan text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Connexion...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <form
        ref={formRef}
        method="POST"
        action={MIKROTIK_LOGIN_ACTION}
        className="space-y-4 text-left"
        onSubmit={(e) => {
          if (!username.trim() || !password) {
            e.preventDefault();
            setError("Entrez votre code ticket");
            setStatus("manual");
            return;
          }
          setError(null);
          setStatus("connecting");
        }}
      >
        <input type="hidden" name="dst" value={dst} />
        <input type="hidden" name="popup" value="true" />

        <label className="block space-y-1">
          <span className="text-xs text-white/50">Code ticket</span>
          <input
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
            placeholder="BN-XXXX-XXXX"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-center tracking-widest outline-none focus:border-cyan/50"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-white/50">Mot de passe</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-center outline-none focus:border-cyan/50"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-cyan py-3.5 font-bold text-[#050A10] hover:bg-cyan/90 transition"
        >
          Se connecter
        </button>
      </form>

      <p className="text-[10px] text-white/40">
        EMMANUEL NET &copy; 2026
      </p>
    </div>
  );
}

export function HotspotLoginPortal() {
  return (
    <div className="min-h-screen bg-[#050A10] text-white flex flex-col items-center justify-center p-6">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-white/50">
            <Loader2 className="w-5 h-5 animate-spin" />
            Chargement…
          </div>
        }
      >
        <HotspotLoginForm />
      </Suspense>
    </div>
  );
}
