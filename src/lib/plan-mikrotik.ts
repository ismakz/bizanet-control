import { AccessType, Plan, Router } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { connectRouter } from "@/lib/mikrotik";
import { toMikrotikSessionTimeout } from "@/lib/time";
import { isCloudRouterBlocked } from "@/lib/router-access";
import {
  agentRemoveHotspotProfile,
  agentRemovePppProfile,
  agentUpsertHotspotProfile,
  agentUpsertPppProfile,
} from "@/lib/mikrotik-agent";

type RouterRow = Pick<Router, "id" | "networkMode" | "name">;

export type PlanMikrotikSyncResult = {
  skipped: boolean;
  updated: number;
  warnings: string[];
};

function isRouterMock(router: RouterRow): boolean {
  if (router.networkMode === "mock") return true;
  if (router.networkMode === "live") return false;
  return process.env.BIZANET_NETWORK_MODE === "mock";
}

function hotspotProfileName(planId: string): string {
  return `bizanet-${planId}`;
}

function pppProfileName(planId: string): string {
  return `bizanet-pppoe-${planId}`;
}

async function upsertHotspotProfileOnRouter(
  router: RouterRow,
  plan: Plan
): Promise<string | null> {
  const name = hotspotProfileName(plan.id);
  const rateLimit = `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`;
  const sessionTimeout = toMikrotikSessionTimeout(plan.durationValue, plan.durationUnit);

  if (isRouterMock(router)) {
    const client = await connectRouter(router as Router);
    try {
      const profileMenu = (client as any).menu("/ip hotspot user profile");
      const profiles = await profileMenu.where("name", name).get();
      const profileData = {
        name,
        "rate-limit": rateLimit,
        "shared-users": "1",
        "session-timeout": sessionTimeout,
        "idle-timeout": "none",
        "keepalive-timeout": "2m",
        "status-autorefresh": "1m",
      };
      if (profiles.length === 0) {
        await profileMenu.add(profileData);
      } else {
        await profileMenu.where("name", name).set(profileData);
      }
      return null;
    } finally {
      client.close();
    }
  }

  const res = await agentUpsertHotspotProfile({
    name,
    rateLimit,
    sessionTimeout,
  });
  if (!res.ok) {
    return res.error || `Profil hotspot non mis à jour sur ${router.name}`;
  }
  return null;
}

async function upsertPppProfileOnRouter(
  router: RouterRow,
  plan: Plan
): Promise<string | null> {
  const name = pppProfileName(plan.id);
  const rateLimit = `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`;

  if (isRouterMock(router)) {
    const client = await connectRouter(router as Router);
    try {
      const profileMenu = (client as any).menu("/ppp profile");
      const profiles = await profileMenu.where("name", name).get();
      const profileData = {
        name,
        "rate-limit": rateLimit,
        "only-one": "yes",
      };
      if (profiles.length === 0) {
        await profileMenu.add(profileData);
      } else {
        await profileMenu.where("name", name).set(profileData);
      }
      return null;
    } finally {
      client.close();
    }
  }

  const res = await agentUpsertPppProfile({ name, rateLimit });
  if (!res.ok) {
    return res.error || `Profil PPPoE non mis à jour sur ${router.name}`;
  }
  return null;
}

async function removeHotspotProfileOnRouter(
  router: RouterRow,
  planId: string
): Promise<string | null> {
  const name = hotspotProfileName(planId);

  if (isRouterMock(router)) {
    const client = await connectRouter(router as Router);
    try {
      const profileMenu = (client as any).menu("/ip hotspot user profile");
      const profiles = await profileMenu.where("name", name).get();
      for (const p of profiles) {
        if (p[".id"]) await profileMenu.remove(p[".id"]);
      }
      return null;
    } catch {
      return null;
    } finally {
      client.close();
    }
  }

  const res = await agentRemoveHotspotProfile(name);
  if (!res.ok) {
    return res.error || `Profil hotspot non supprimé sur ${router.name}`;
  }
  return null;
}

async function removePppProfileOnRouter(
  router: RouterRow,
  planId: string
): Promise<string | null> {
  const name = pppProfileName(planId);

  if (isRouterMock(router)) {
    const client = await connectRouter(router as Router);
    try {
      const profileMenu = (client as any).menu("/ppp profile");
      const profiles = await profileMenu.where("name", name).get();
      for (const p of profiles) {
        if (p[".id"]) await profileMenu.remove(p[".id"]);
      }
      return null;
    } catch {
      return null;
    } finally {
      client.close();
    }
  }

  const res = await agentRemovePppProfile(name);
  if (!res.ok) {
    return res.error || `Profil PPPoE non supprimé sur ${router.name}`;
  }
  return null;
}

/** Met à jour les profils MikroTik liés au forfait (best-effort). */
export async function syncPlanOnMikrotik(plan: Plan): Promise<PlanMikrotikSyncResult> {
  if (isCloudRouterBlocked()) {
    return { skipped: true, updated: 0, warnings: [] };
  }

  const routers = await prisma.router.findMany({
    where: { companyId: plan.companyId },
    select: { id: true, networkMode: true, name: true },
  });

  const warnings: string[] = [];
  let updated = 0;

  for (const router of routers) {
    try {
      if (plan.accessType === AccessType.HOTSPOT_WIFI) {
        const err = await upsertHotspotProfileOnRouter(router, plan);
        if (err) warnings.push(err);
        else updated += 1;
      } else if (plan.accessType === AccessType.PPPOE) {
        const err = await upsertPppProfileOnRouter(router, plan);
        if (err) warnings.push(err);
        else updated += 1;
      }
    } catch (e) {
      warnings.push(
        e instanceof Error ? e.message : `Erreur MikroTik (${router.name})`
      );
    }
  }

  return { skipped: false, updated, warnings };
}

/** Supprime les profils MikroTik associés au forfait (best-effort). */
export async function deletePlanOnMikrotik(
  plan: Pick<Plan, "id" | "companyId" | "accessType">
): Promise<PlanMikrotikSyncResult> {
  if (isCloudRouterBlocked()) {
    return { skipped: true, updated: 0, warnings: [] };
  }

  const routers = await prisma.router.findMany({
    where: { companyId: plan.companyId },
    select: { id: true, networkMode: true, name: true },
  });

  const warnings: string[] = [];
  let updated = 0;

  for (const router of routers) {
    try {
      if (plan.accessType === AccessType.HOTSPOT_WIFI) {
        const err = await removeHotspotProfileOnRouter(router, plan.id);
        if (err) warnings.push(err);
        else updated += 1;
      } else if (plan.accessType === AccessType.PPPOE) {
        const err = await removePppProfileOnRouter(router, plan.id);
        if (err) warnings.push(err);
        else updated += 1;
      }
    } catch (e) {
      warnings.push(
        e instanceof Error ? e.message : `Erreur MikroTik (${router.name})`
      );
    }
  }

  return { skipped: false, updated, warnings };
}
