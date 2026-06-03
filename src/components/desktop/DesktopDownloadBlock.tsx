"use client";

import { BizaNetLogo } from "@/components/branding/BizaNetLogo";
import {
  DESKTOP_INSTALLER_FILENAME,
  getDesktopDownloadUrl,
  isDesktopDownloadAvailable,
} from "@/lib/desktop-download";
import { Download, Monitor } from "lucide-react";

type DesktopDownloadBlockProps = {
  /** inline = compact row ; card = encart mis en avant */
  variant?: "inline" | "card";
  className?: string;
};

export function DesktopDownloadBlock({
  variant = "card",
  className = "",
}: DesktopDownloadBlockProps) {
  const downloadUrl = getDesktopDownloadUrl();
  const available = isDesktopDownloadAvailable();

  if (variant === "inline") {
    if (!available) {
      return (
        <p
          className={`text-xs text-white/40 text-center ${className}`}
          role="status"
        >
          Application Windows bientôt disponible
        </p>
      );
    }

    return (
      <a
        href={downloadUrl}
        download={DESKTOP_INSTALLER_FILENAME}
        rel="noopener noreferrer"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-2.5 text-sm font-semibold text-cyan transition hover:bg-cyan/20 ${className}`}
      >
        <Download className="h-4 w-4 shrink-0" />
        Télécharger BizaNet Desktop
      </a>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/10 bg-gradient-to-br from-[#0B131E] to-[#050A10] p-4 md:p-5 ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-12 w-12 rounded-xl border border-white/10 bg-black/30 p-1.5 flex items-center justify-center">
            <BizaNetLogo className="h-full w-full object-contain" alt="BizaNet" />
          </div>
          <div className="hidden sm:block h-10 w-10 rounded-lg bg-cyan/10 flex items-center justify-center text-cyan">
            <Monitor className="h-5 w-5" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white">BizaNet Desktop (Windows)</h2>
          <p className="mt-1 text-xs text-white/50 leading-relaxed">
            Application locale pour lancer BizaNet Control, BizaNet-Agent et la connexion
            MikroTik sur le PC du cybercafé.
          </p>
          {!available ? (
            <p className="mt-2 text-xs text-amber-200/80" role="status">
              Application Windows bientôt disponible
            </p>
          ) : null}
        </div>

        {available ? (
          <a
            href={downloadUrl}
            download={DESKTOP_INSTALLER_FILENAME}
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-2.5 text-sm font-semibold text-[#050A10] shadow-neon transition hover:bg-cyan/90"
          >
            <Download className="h-4 w-4" />
            Télécharger pour Windows
          </a>
        ) : null}
      </div>
    </div>
  );
}
