/** Message affiché quand le contrôle MikroTik n'est pas disponible depuis le cloud. */
export const LOCAL_ROUTER_MESSAGE =
  "Contrôle MikroTik disponible uniquement sur le serveur local.";

/** Déploiement Vercel / cloud (pas d'accès aux routeurs 192.168.x.x). */
export function isCloudDeployment(): boolean {
  if (process.env.VERCEL === "1") return true;
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    return true;
  }
  const urls = [process.env.VERCEL_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
    Boolean
  ) as string[];
  return urls.some((url) => /\.vercel\.app/i.test(url));
}

/** Serveur local (dev ou hébergement LAN) — peut joindre MikroTik. */
export function isLocalDeployment(): boolean {
  return !isCloudDeployment();
}

/**
 * Bloque les opérations live MikroTik (stats, sync, test, polling).
 * Sur cloud : toujours bloqué. En local : autorisé (log [LOCAL ROUTER MODE] si LOCAL_ROUTER_ONLY=true).
 */
export function isCloudRouterBlocked(): boolean {
  if (isCloudDeployment()) {
    console.log("[CLOUD ROUTER BLOCKED]");
    return true;
  }
  if (process.env.LOCAL_ROUTER_ONLY === "true") {
    console.log("[LOCAL ROUTER MODE]");
  }
  return false;
}

export type CloudRouterBlockedPayload = {
  success: false;
  localOnly: true;
  message: string;
};

export function cloudRouterBlockedResponse(
  extra?: Record<string, unknown>
): CloudRouterBlockedPayload & Record<string, unknown> {
  return {
    success: false,
    localOnly: true,
    message: LOCAL_ROUTER_MESSAGE,
    ...extra,
  };
}

/** Infos exposées à l'UI (API / client). */
export function getRouterAccessMode() {
  const cloud = isCloudDeployment();
  const blocked = isCloudRouterBlocked();
  return {
    cloud,
    local: isLocalDeployment(),
    localRouterOnly: process.env.LOCAL_ROUTER_ONLY === "true",
    cloudRouterBlocked: blocked,
    message: blocked ? LOCAL_ROUTER_MESSAGE : null,
  };
}
