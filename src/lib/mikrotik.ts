import { RouterOSClient } from "routeros-client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { Router } from "@prisma/client";
import { createRouterOfflineAlert } from "@/lib/alerts";

type RouterConnectionInput = Pick<Router, "host" | "username" | "encryptedPassword"> & {
  apiPort?: number | null;
  networkMode?: string | null;
};

function isRouterInMockMode(router?: { networkMode?: string | null } | null): boolean {
  if (router?.networkMode === "mock") return true;
  if (router?.networkMode === "live") return false;
  return process.env.BIZANET_NETWORK_MODE === "mock";
}

class MockRouterOSClient {
  async connect() { return; }
  async close() { return; }
  menu() {
    return {
      get: async () => [],
      add: async () => {},
      set: async () => {},
      remove: async () => {},
      enable: async () => {},
      disable: async () => {},
      where: () => this.menu(),
    };
  }
}

export async function connectRouter(router: RouterConnectionInput) {
  if (isRouterInMockMode(router)) {
    // Simulate network delay
    await new Promise(res => setTimeout(res, 500));
    return new MockRouterOSClient();
  }

  const client = new RouterOSClient({
    host: router.host,
    port: router.apiPort ?? 8728,
    user: router.username,
    password: decrypt(router.encryptedPassword),
    keepalive: true,
  });
  await client.connect();
  return client;
}

// Helper to create a NetworkJob on failure
async function handleMikroTikFailure(
  action: "ACTIVATE" | "SUSPEND" | "CREATE_USER" | "TEST_ROUTER",
  routerId: string,
  companyId: string,
  customerId: string | null,
  error: any
) {
  console.error(`MikroTik action ${action} failed:`, error.message);
  
  if (action === "TEST_ROUTER") return; // Tests are handled manually

  await prisma.networkJob.create({
    data: {
      action,
      companyId,
      routerId,
      customerId,
      status: "PENDING",
      lastError: error.message,
    }
  });
}

export async function testRouterConnection(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  try {
    const client = await connectRouter(router);
    await client.close();
    const now = new Date();

    const updated = await prisma.router.update({
      where: { id: routerId },
      data: { status: "ONLINE", lastError: null, lastSeenAt: now },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      router: updated,
      message: "MikroTik connecté avec succès.",
    };
  } catch (error: any) {
    const updated = await prisma.router.update({
      where: { id: routerId },
      data: { status: "OFFLINE", lastError: error.message },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await createRouterOfflineAlert(router, error.message);

    return {
      success: false,
      router: updated,
      message: "Impossible de joindre MikroTik. Vérifiez IP, port, username, password et accès API.",
    };
  }
}

export async function createHotspotUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");
  if (!customer.subscriptions || customer.subscriptions.length === 0) throw new Error("Aucune souscription active trouvée");

  const plan = customer.subscriptions[0].plan;
  const profileName = `bizanet-${plan.id}`;
  const client = await connectRouter(customer.router);

  try {
    const profileMenu = (client as any).menu("/ip hotspot user profile");
    const profiles = await profileMenu.where("name", profileName).get();
    if (profiles.length === 0) {
      await profileMenu.add({
        name: profileName,
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "shared-users": "1",
      });
    } else {
      await profileMenu.where("name", profileName).set({
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "shared-users": "1",
      });
    }

    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length === 0) {
      await userMenu.add({
        name: customer.username,
        password: customer.password,
        profile: profileName,
      });
    } else {
      await userMenu.where("name", customer.username).set({
        password: customer.password,
        profile: profileName,
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("CREATE_USER", customer.router.id, customer.companyId, customer.id, error);
    throw error;
  } finally {
    client.close();
  }
}

export async function activateUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");

  const client = await connectRouter(customer.router);
  try {
    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length > 0) {
      // Activer l'utilisateur
      await userMenu.where("name", customer.username).enable();
    } else {
      throw new Error(`Utilisateur ${customer.username} introuvable sur le routeur`);
    }

    // Supprimer les sessions actives pour forcer la reconnexion avec le nouveau profil/statut
    const activeMenu = (client as any).menu("/ip hotspot active");
    const activeSessions = await activeMenu.where("user", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { status: "ACTIVE" },
    });
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
    // Don't throw, let the customer be PENDING_PAYMENT or whatever, we will retry later
    await prisma.customer.update({
      where: { id: customerId },
      data: { status: "PENDING" }, // Revert or stay pending
    });
  } finally {
    client.close();
  }
}

export async function disconnectUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");

  const client = await connectRouter(customer.router);
  try {
    const activeMenu = (client as any).menu("/ip hotspot active");
    const activeSessions = await activeMenu.where("user", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }
  } catch (error: any) {
    console.error("Error disconnecting MikroTik user:", error);
    throw error;
  } finally {
    client.close();
  }
}

export async function suspendUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) return; // Ne pas planter si pas de routeur, juste retourner

  const client = await connectRouter(customer.router);
  try {
    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length > 0) {
      // Désactiver l'utilisateur
      await userMenu.where("name", customer.username).disable();
    }

    // Déconnecter l'utilisateur s'il est en ligne
    const activeMenu = (client as any).menu("/ip hotspot active");
    const activeSessions = await activeMenu.where("user", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { status: "SUSPENDED" },
    });
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
    console.error("Error suspending MikroTik user:", error);
  } finally {
    client.close();
  }
}

export async function deleteUser(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const userMenu = (client as any).menu("/ip hotspot user");
    const users = await userMenu.where("name", customer.username).get();
    if (users.length > 0 && users[0][".id"]) {
      await userMenu.remove(users[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting MikroTik user:", error);
  } finally {
    client.close();
  }
}

export async function getActiveUsers(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) {
      // Mock data
      return [
        { "user": "test1", "address": "192.168.88.10", "uptime": "1d2h", "bytes-in": "12000", "bytes-out": "45000" },
        { "user": "test2", "address": "192.168.88.11", "uptime": "5h", "bytes-in": "5000", "bytes-out": "15000" }
      ];
    }
    const activeMenu = (client as any).menu("/ip hotspot active");
    const activeUsers = await activeMenu.get();
    return activeUsers;
  } catch (error: any) {
    console.error("Error getting active users:", error.message);
    return [];
  } finally {
    client.close();
  }
}

// --- PPPoE Functions ---

export async function createPppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer) throw new Error("Customer introuvable");
  if (!customer.router) throw new Error("Aucun routeur assigné au client");
  if (!customer.subscriptions || customer.subscriptions.length === 0) throw new Error("Aucune souscription active trouvée");

  const plan = customer.subscriptions[0].plan;
  const profileName = `bizanet-pppoe-${plan.id}`;
  const client = await connectRouter(customer.router);

  try {
    const profileMenu = (client as any).menu("/ppp profile");
    const profiles = await profileMenu.where("name", profileName).get();
    if (profiles.length === 0) {
      await profileMenu.add({
        name: profileName,
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "only-one": "yes",
      });
    } else {
      await profileMenu.where("name", profileName).set({
        "rate-limit": `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`,
        "only-one": "yes",
      });
    }

    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length === 0) {
      await secretMenu.add({
        name: customer.username,
        password: customer.password,
        service: "pppoe",
        profile: profileName,
      });
    } else {
      await secretMenu.where("name", customer.username).set({
        password: customer.password,
        service: "pppoe",
        profile: profileName,
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("CREATE_USER", customer.router.id, customer.companyId, customer.id, error);
    throw error;
  } finally {
    client.close();
  }
}

export async function activatePppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0) {
      await secretMenu.where("name", customer.username).enable();
    }
    
    // Disconnect active session to force reconnect with new status
    const activeMenu = (client as any).menu("/ppp active");
    const activeSessions = await activeMenu.where("name", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function suspendPppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0) {
      await secretMenu.where("name", customer.username).disable();
    }
    
    // Disconnect active session
    const activeMenu = (client as any).menu("/ppp active");
    const activeSessions = await activeMenu.where("name", customer.username).get();
    for (const session of activeSessions) {
      if (session[".id"]) {
        await activeMenu.remove(session[".id"]);
      }
    }
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function deletePppoeSecret(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const client = await connectRouter(customer.router);
  try {
    const secretMenu = (client as any).menu("/ppp secret");
    const secrets = await secretMenu.where("name", customer.username).get();
    if (secrets.length > 0 && secrets[0][".id"]) {
      await secretMenu.remove(secrets[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting PPPoE user:", error);
  } finally {
    client.close();
  }
}

export async function getPppoeActiveUsers(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) return [];
    const activeMenu = (client as any).menu("/ppp active");
    return await activeMenu.get();
  } catch (error: any) {
    console.error("Error getting active PPPoE users:", error.message);
    return [];
  } finally {
    client.close();
  }
}

// --- Wired Ethernet Functions ---

export async function getDhcpLeases(routerId: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isRouterInMockMode(router as any)) {
      return [
        { "mac-address": "AA:BB:CC:DD:EE:FF", "address": "192.168.1.50", "status": "bound", "host-name": "Desktop-PC" }
      ];
    }
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    return await leaseMenu.get();
  } catch (error: any) {
    console.error("Error getting DHCP leases:", error.message);
    return [];
  } finally {
    client.close();
  }
}

export async function createDhcpMacBinding(routerId: string, macAddress: string, ipAddress: string) {
  const router = await prisma.router.findUnique({
    where: { id: routerId },
    select: {
      id: true,
      companyId: true,
      name: true,
      host: true,
      username: true,
      encryptedPassword: true,
    },
  });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    const leases = await leaseMenu.where("mac-address", macAddress).get();
    
    if (leases.length > 0) {
      const lease = leases[0];
      if (lease.dynamic === "true" || lease.dynamic === true) {
        // Make static
        await (client as any).write([
          "/ip/dhcp-server/lease/make-static",
          `=numbers=${lease[".id"]}`
        ]);
      }
    } else {
      // Create static lease
      await leaseMenu.add({
        "mac-address": macAddress,
        "address": ipAddress,
        comment: "bizanet-wired"
      });
    }
  } catch (error: any) {
    console.error("Error creating DHCP MAC binding:", error.message);
  } finally {
    client.close();
  }
}

export async function activateWiredClient(customerId: string, macAddress: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true, subscriptions: { include: { plan: true }, where: { status: "ACTIVE" } } },
  });

  if (!customer || !customer.router) return;
  if (!customer.subscriptions || customer.subscriptions.length === 0) return;

  const plan = customer.subscriptions[0].plan;
  const queueName = `bizanet-wired-${customer.username}`;
  
  const client = await connectRouter(customer.router);
  try {
    // Determine the IP address from DHCP lease to create the Simple Queue
    const leaseMenu = (client as any).menu("/ip dhcp-server lease");
    const leases = await leaseMenu.where("mac-address", macAddress).get();
    let targetIp = leases.length > 0 ? leases[0].address : null;

    if (!targetIp) throw new Error(`No IP found for MAC ${macAddress}`);

    // Create or update Simple Queue
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    
    const rateLimit = `${plan.uploadLimitMbps}M/${plan.downloadLimitMbps}M`;
    
    if (queues.length === 0) {
      await queueMenu.add({
        name: queueName,
        target: targetIp,
        "max-limit": rateLimit,
        comment: "bizanet-wired"
      });
    } else {
      await queueMenu.where("name", queueName).set({
        target: targetIp,
        "max-limit": rateLimit,
        disabled: "no"
      });
    }
  } catch (error: any) {
    await handleMikroTikFailure("ACTIVATE", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function suspendWiredClient(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const queueName = `bizanet-wired-${customer.username}`;
  const client = await connectRouter(customer.router);
  try {
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    if (queues.length > 0) {
      // Limit to 1k/1k effectively suspending
      await queueMenu.where("name", queueName).set({
        "max-limit": "1k/1k"
      });
    }
    
    // Optionally: drop existing connections for that IP so it takes effect immediately
  } catch (error: any) {
    await handleMikroTikFailure("SUSPEND", customer.router.id, customer.companyId, customer.id, error);
  } finally {
    client.close();
  }
}

export async function deleteWiredClient(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { router: true },
  });

  if (!customer || !customer.router) return;

  const queueName = `bizanet-wired-${customer.username}`;
  const client = await connectRouter(customer.router);
  try {
    const queueMenu = (client as any).menu("/queue simple");
    const queues = await queueMenu.where("name", queueName).get();
    if (queues.length > 0 && queues[0][".id"]) {
      await queueMenu.remove(queues[0][".id"]);
    }
  } catch (error) {
    console.error("Error deleting Wired user queue:", error);
  } finally {
    client.close();
  }
}
