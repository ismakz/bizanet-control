"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Keyboard, ArrowRight, Wifi } from "lucide-react";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";

export default function PortalLandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"MANUAL" | "SCAN">("MANUAL");
  const [token, setToken] = useState("");

  useEffect(() => {
    if (mode === "SCAN") {
      const scanner = new Html5QrcodeScanner(
        "reader",
        {
          qrbox: { width: 250, height: 250 },
          fps: 10,
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        },
        false
      );

      scanner.render(
        (decodedText) => {
          try {
            const url = new URL(decodedText);
            const username = url.searchParams.get("username");
            const password = url.searchParams.get("password");

            if (username && password) {
              scanner.clear();
              window.location.href = decodedText;
              return;
            }

            const tokenParam = url.searchParams.get("token");
            if (tokenParam) {
              scanner.clear();
              router.push(`/portal/activate?token=${tokenParam}`);
              return;
            }
          } catch {
            // pas une URL
          }

          scanner.clear();
          router.push(`/portal/activate?token=${decodedText}`);
        },
        (error) => {
          // Ignorer les erreurs de scan continu
        }
      );

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [mode, router]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      router.push(`/portal/activate?token=${token.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#050A10] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0B131E]/80 border border-white/5 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-cyan/20 blur-[100px] rounded-full" />
        
        <div className="relative flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-cyan/10 rounded-2xl flex items-center justify-center text-cyan shadow-[0_0_30px_rgba(0,242,254,0.2)]">
            <Wifi className="w-8 h-8" />
          </div>
          
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Bienvenue sur BizaNet</h1>
            <p className="text-white/60 text-sm">
              Pour activer votre accès internet, scannez votre ticket ou entrez votre code.
            </p>
          </div>

          <div className="w-full flex bg-black/40 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => setMode("MANUAL")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                mode === "MANUAL" ? "bg-white/10 text-white shadow-lg" : "text-white/50 hover:text-white/80"
              }`}
            >
              <Keyboard className="w-4 h-4" /> Entrer le code
            </button>
            <button
              onClick={() => setMode("SCAN")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                mode === "SCAN" ? "bg-white/10 text-white shadow-lg" : "text-white/50 hover:text-white/80"
              }`}
            >
              <QrCode className="w-4 h-4" /> Scanner QR
            </button>
          </div>

          <div className="w-full min-h-[250px] flex flex-col justify-center">
            {mode === "MANUAL" ? (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="BN-XXXX-XXXX"
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-4 text-white placeholder:text-white/20 outline-none focus:border-cyan/50 font-mono text-xl text-center tracking-widest uppercase transition-colors"
                />
                <button
                  type="submit"
                  disabled={!token.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-4 text-sm font-bold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50"
                >
                  Activer mon accès <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <div className="w-full overflow-hidden rounded-2xl border-2 border-dashed border-cyan/30 bg-black/50 p-2">
                <div id="reader" className="w-full bg-black/80 rounded-xl overflow-hidden [&>div]:border-none [&>div>video]:w-full [&_button]:hidden [&>div>a]:hidden"></div>
                <p className="text-xs text-center mt-4 text-white/50">Pointez la caméra vers le QR Code de votre ticket.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
