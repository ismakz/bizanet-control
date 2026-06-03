/**
 * Portail hotspot pour tickets QR / WhatsApp.
 * URL fixe production — jamais localhost, login.bizanet ni vercel.app.
 */

/** Origine publique pour QR codes, partage et portail client. */
export const HOTSPOT_TICKET_LOGIN_ORIGIN = "https://bizanetcontrol.online";

/** Base URL fixe du portail hotspot (sans query string). */
export const HOTSPOT_TICKET_LOGIN_URL = `${HOTSPOT_TICKET_LOGIN_ORIGIN}/hotspot/login`;

/** Anciens hôtes DNS / QR — redirigés vers le portail production (middleware). */
export const LEGACY_HOTSPOT_LOGIN_HOSTS = [
  "login.bizanet",
  "bizanet-control.vercel.app",
] as const;

const FORBIDDEN_TICKET_URL_PATTERN =
  /login\.bizanet|vercel\.app|localhost|127\.0\.0\.1/i;

/** URL complète du portail hotspot (scan QR, WhatsApp). */
export function buildHotspotTicketLoginUrl(tokenCode: string): string {
  const code = tokenCode.trim().toUpperCase();
  const url = new URL(HOTSPOT_TICKET_LOGIN_URL);
  url.searchParams.set("username", code);
  url.searchParams.set("password", code);
  const result = url.toString();
  if (FORBIDDEN_TICKET_URL_PATTERN.test(result)) {
    throw new Error(`Invalid hotspot ticket URL: ${result}`);
  }
  return result;
}

/** Libellé court pour instructions ticket imprimé. */
export function getHotspotTicketLoginDisplayUrl(): string {
  return HOTSPOT_TICKET_LOGIN_URL.replace(/^https?:\/\//, "");
}

/**
 * @deprecated Utiliser buildHotspotTicketLoginUrl pour les tickets.
 */
export function getHotspotLoginBaseUrl(): string {
  return HOTSPOT_TICKET_LOGIN_ORIGIN;
}

export function isLegacyHotspotLoginHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  return LEGACY_HOTSPOT_LOGIN_HOSTS.some(
    (legacy) => host === legacy || host.endsWith(`.${legacy}`)
  );
}

/** Redirection 308 depuis anciens hôtes (login.bizanet, vercel.app preview). */
export function buildLegacyHotspotLoginRedirectUrl(
  searchParams: URLSearchParams
): URL {
  const dest = new URL(HOTSPOT_TICKET_LOGIN_URL);
  searchParams.forEach((value, key) => {
    dest.searchParams.set(key, value);
  });
  return dest;
}

/** Hôte du portail captive sur le domaine production (pas login.bizanet). */
export function isHotspotLoginHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  const productionHost = new URL(HOTSPOT_TICKET_LOGIN_ORIGIN).hostname.toLowerCase();
  return host === productionHost;
}
