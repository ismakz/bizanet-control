/** URL publique du installateur Windows (NEXT_PUBLIC_*, exposé au navigateur). */
export function getDesktopDownloadUrl(): string {
  return process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL?.trim() ?? "";
}

export function isDesktopDownloadAvailable(): boolean {
  return getDesktopDownloadUrl().length > 0;
}

export const DESKTOP_INSTALLER_FILENAME = "BizaNet-Desktop-Setup.exe";
