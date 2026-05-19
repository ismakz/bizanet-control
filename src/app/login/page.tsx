import { headers } from "next/headers";
import { HotspotLoginPortal } from "@/components/hotspot/HotspotLoginPortal";
import { AdminLoginPage } from "@/components/auth/AdminLoginPage";
import { isHotspotLoginHostname } from "@/lib/hotspot-login-url";

export default function LoginPage() {
  const host = headers().get("host") || "";

  if (isHotspotLoginHostname(host)) {
    return <HotspotLoginPortal />;
  }

  return <AdminLoginPage />;
}
