"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "bizanet_pwa_install_dismissed";

export function PwaInstallHint() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    if (isStandalone) {
      setInstalled(true);
      return;
    }

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (installed || !visible || !deferredPrompt) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-cyan/30 bg-[#0B131E] p-4 shadow-lg shadow-cyan/10 lg:left-auto lg:right-6"
      role="region"
      aria-label="Installer l'application"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-cyan/10 p-2 text-cyan">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Installer BizaNet Control</p>
          <p className="mt-1 text-xs text-white/50">
            Ajoutez l&apos;app à l&apos;écran d&apos;accueil pour un accès rapide (PWA).
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-cyan px-3 py-1.5 text-xs font-semibold text-[#050A10] hover:bg-cyan/90"
            >
              Installer
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-white/40 hover:text-white"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
