import { withMikrotik } from "./connection";
import { config } from "../config";

type RosMenu = {
  where: (k: string, v: string) => {
    get: () => Promise<Record<string, unknown>[]>;
    set: (d: Record<string, string>) => Promise<void>;
    remove?: (id: string) => Promise<void>;
  };
  add: (d: Record<string, string>) => Promise<void>;
  remove?: (id: string) => Promise<void>;
};

function menu(api: unknown, path: string): RosMenu {
  return (api as any).menu(path);
}

export async function listHotspotProfiles(): Promise<string[]> {
  return withMikrotik(async (api) => {
    const profileMenu = (api as any).menu("/ip hotspot user profile");
    const rows = await profileMenu.get();
    return rows
      .map((r: Record<string, unknown>) =>
        typeof r.name === "string" ? r.name : ""
      )
      .filter(Boolean);
  });
}

export async function upsertHotspotProfile(input: {
  name: string;
  rateLimit: string;
  sessionTimeout?: string;
}): Promise<void> {
  await withMikrotik(async (api) => {
    const profileMenu = menu(api, "/ip hotspot user profile");
    const existing = await profileMenu.where("name", input.name).get();
    const data: Record<string, string> = {
      name: input.name,
      "rate-limit": input.rateLimit,
      "shared-users": "1",
      "session-timeout": input.sessionTimeout || "none",
      "idle-timeout": "none",
      "keepalive-timeout": "2m",
    };
    if (existing.length === 0) {
      await profileMenu.add(data);
    } else {
      await profileMenu.where("name", input.name).set(data);
    }
  });
}

export async function removeHotspotProfile(name: string): Promise<void> {
  await withMikrotik(async (api) => {
    const profileMenu = menu(api, "/ip hotspot user profile");
    const rows = await profileMenu.where("name", name).get();
    for (const row of rows) {
      const id = row[".id"];
      if (typeof id === "string" && profileMenu.remove) {
        await profileMenu.remove(id);
      }
    }
  });
}

export async function createHotspotUser(input: {
  username: string;
  password: string;
  profile: string;
  comment?: string;
  limitUptime?: string;
  disabled?: "yes" | "no";
}): Promise<{ profile: string; created: boolean }> {
  const profile = input.profile || config.tokenProfile;
  const profiles = await listHotspotProfiles();
  if (!profiles.includes(profile)) {
    const err = new Error(`Profil hotspot introuvable: ${profile}`);
    (err as Error & { availableProfiles?: string[] }).availableProfiles = profiles;
    throw err;
  }

  await withMikrotik(async (api) => {
    const userMenu = menu(api, "/ip hotspot user");
    const existing = await userMenu.where("name", input.username).get();
    const data: Record<string, string> = {
      name: input.username,
      password: input.password,
      profile,
      comment: input.comment || `bizanet-${input.username}`,
      disabled: input.disabled || "no",
    };
    if (input.limitUptime) {
      data["limit-uptime"] = input.limitUptime;
    }
    if (existing.length === 0) {
      await userMenu.add(data);
    } else {
      await userMenu.where("name", input.username).set(data);
    }
  });

  return { profile, created: true };
}

export async function removeHotspotUser(username: string): Promise<void> {
  await withMikrotik(async (api) => {
    const userMenu = menu(api, "/ip hotspot user");
    const users = await userMenu.where("name", username).get();
    for (const u of users) {
      const id = u[".id"];
      if (typeof id === "string" && userMenu.remove) {
        await userMenu.remove(id);
      }
    }
    const activeMenu = menu(api, "/ip hotspot active");
    const sessions = await activeMenu.where("user", username).get();
    for (const s of sessions) {
      const id = s[".id"];
      if (typeof id === "string" && activeMenu.remove) {
        await activeMenu.remove(id);
      }
    }
  });
}

export async function enableHotspotUser(username: string): Promise<void> {
  await withMikrotik(async (api) => {
    const userMenu = menu(api, "/ip hotspot user");
    await userMenu.where("name", username).set({ disabled: "no" });
  });
}

export async function disableHotspotUser(username: string): Promise<void> {
  await withMikrotik(async (api) => {
    const userMenu = menu(api, "/ip hotspot user");
    await userMenu.where("name", username).set({ disabled: "yes" });
  });
}

export async function removeActiveSession(input: {
  username?: string;
  sessionId?: string | null;
}): Promise<void> {
  await withMikrotik(async (api) => {
    const activeMenu = menu(api, "/ip hotspot active");
    if (input.sessionId) {
      await activeMenu.remove?.(input.sessionId);
      return;
    }
    if (input.username) {
      const sessions = await activeMenu.where("user", input.username).get();
      for (const s of sessions) {
        const id = s[".id"];
        if (typeof id === "string") await activeMenu.remove?.(id);
      }
    }
  });
}

export async function forceExpireUser(username: string): Promise<{
  sessionsRemoved: number;
  hostsRemoved: number;
}> {
  let sessionsRemoved = 0;
  let hostsRemoved = 0;

  await withMikrotik(async (api) => {
    const activeMenu = menu(api, "/ip hotspot active");
    const hostMenu = menu(api, "/ip hotspot host");
    const userMenu = menu(api, "/ip hotspot user");

    const sessions = await activeMenu.where("user", username).get();
    for (const s of sessions) {
      const mac = s["mac-address"];
      if (typeof mac === "string" && mac) {
        try {
          const hosts = await hostMenu.where("mac-address", mac).get();
          for (const h of hosts) {
            const id = h[".id"];
            if (typeof id === "string" && hostMenu.remove) {
              await hostMenu.remove(id);
              hostsRemoved += 1;
            }
          }
        } catch {
          /* host déjà absent */
        }
      }
      const sid = s[".id"];
      if (typeof sid === "string" && activeMenu.remove) {
        try {
          await activeMenu.remove(sid);
          sessionsRemoved += 1;
        } catch {
          /* session déjà absente */
        }
      }
    }

    const users = await userMenu.where("name", username).get();
    if (users.length > 0) {
      await userMenu.where("name", username).set({ disabled: "yes" });
    }
  });

  return { sessionsRemoved, hostsRemoved };
}

export async function getSessionStatus(username: string): Promise<{
  connected: boolean;
  address: string | null;
  uptime: string | null;
  bytesIn: number;
  bytesOut: number;
  disabled: boolean;
}> {
  return withMikrotik(async (api) => {
    const userMenu = menu(api, "/ip hotspot user");
    const users = await userMenu.where("name", username).get();
    const disabled = users[0]?.disabled === "yes" || users[0]?.disabled === true;

    const activeMenu = menu(api, "/ip hotspot active");
    const sessions = await activeMenu.where("user", username).get();
    if (sessions.length === 0) {
      return {
        connected: false,
        address: null,
        uptime: null,
        bytesIn: 0,
        bytesOut: 0,
        disabled: Boolean(disabled),
      };
    }
    const s = sessions[0];
    return {
      connected: true,
      address: typeof s.address === "string" ? s.address : null,
      uptime: typeof s.uptime === "string" ? s.uptime : null,
      bytesIn: Number(s["bytes-in"] ?? 0) || 0,
      bytesOut: Number(s["bytes-out"] ?? 0) || 0,
      disabled: Boolean(disabled),
    };
  });
}

export async function hotspotSnapshot(): Promise<{
  activeSessions: Record<string, unknown>[];
  users: { name: string; disabled: boolean }[];
}> {
  return withMikrotik(async (api) => {
    const activeMenu = (api as any).menu("/ip hotspot active");
    const userMenu = (api as any).menu("/ip hotspot user");
    const activeSessions = await activeMenu.get();
    const usersRaw = await userMenu.get();
    const users = usersRaw.map((u: Record<string, unknown>) => ({
      name: String(u.name ?? ""),
      disabled: u.disabled === "yes" || u.disabled === true,
    }));
    return { activeSessions, users };
  });
}
