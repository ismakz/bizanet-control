/**
 * URL du portail captive MikroTik (login.bizanet).
 * QR / partage : username & password = code ticket BN-XXXX-XXXX
 */
export function getHotspotLoginBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_HOTSPOT_LOGIN_BASE_URL || "http://login.bizanet";
  return base.replace(/\/$/, "");
}

export function buildHotspotTicketLoginUrl(tokenCode: string): string {
  const code = tokenCode.trim().toUpperCase();
  const url = new URL(`${getHotspotLoginBaseUrl()}/login`);
  url.searchParams.set("username", code);
  url.searchParams.set("password", code);
  return url.toString();
}

export function isHotspotLoginHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  const extra = (process.env.HOTSPOT_LOGIN_HOSTS || "login.bizanet")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return extra.some((h) => host === h || host.endsWith(`.${h}`));
}
