"use client";

import { useState } from "react";

type BizaNetLogoProps = {
  className?: string;
  alt?: string;
  /** Afficher les initiales BN si l'image ne charge pas */
  showFallback?: boolean;
  fallbackClassName?: string;
};

const LOGO_SRC = "/bizanet-logo.png";

export function BizaNetLogo({
  className = "h-8 w-8 object-contain",
  alt = "BizaNet Control",
  showFallback = true,
  fallbackClassName = "text-xs font-bold text-cyan",
}: BizaNetLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed && showFallback) {
    return <span className={fallbackClassName}>BN</span>;
  }

  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
