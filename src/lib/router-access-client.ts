export const LOCAL_ROUTER_UI_MESSAGE =
  "Contrôle MikroTik disponible uniquement sur le serveur local.";

/** Détection côté navigateur (complément à /api/router/mode). */
export function isLikelyCloudHost(): boolean {
  if (typeof window === "undefined") return false;
  return /\.vercel\.app$/i.test(window.location.hostname);
}

export function isPublicLocalRouterOnlyEnv(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_ROUTER_ONLY === "true";
}

export type RouterAccessMode = {
  cloud: boolean;
  local: boolean;
  localRouterOnly: boolean;
  cloudRouterBlocked: boolean;
  message: string | null;
};

export async function fetchRouterAccessMode(): Promise<RouterAccessMode | null> {
  try {
    const res = await fetch("/api/router/mode");
    if (!res.ok) return null;
    return (await res.json()) as RouterAccessMode;
  } catch {
    return null;
  }
}
