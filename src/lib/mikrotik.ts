import { RouterOSClient } from "routeros-client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { Router } from "@prisma/client";
import { createRouterOfflineAlert } from "@/lib/alerts";

const isMockMode = process.env.BIZANET_NETWORK_MODE === "mock";

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

export async function connectRouter(router: Router) {
  if (isMockMode) {
    // Simulate network delay
    await new Promise(res => setTimeout(res, 500));
    return new MockRouterOSClient();
  }

  const client = new RouterOSClient({
    host: router.host,
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
  const router = await prisma.router.findUnique({ where: { id: routerId } });
  if (!router) throw new Error("Router introuvable");

  try {
    const client = await connectRouter(router);
    await client.close();

    await prisma.router.update({
      where: { id: routerId },
      data: { status: "ONLINE", lastError: null },
    });
    
    await prisma.auditLog.create({
      data: {
        companyId: router.companyId,
        action: "ROUTER_TEST_SUCCESS",
        entityType: "Router",
        message: `Connexion réussie au routeur ${router.name}`,
      }
    });
    return true;
  } catch (error: any) {
    await prisma.router.update({
      where: { id: routerId },
      data: { status: "OFFLINE", lastError: error.message },
    });
    
    await prisma.auditLog.create({
      data: {
        companyId: router.companyId,
        action: "ROUTER_TEST_FAILED",
        entityType: "Router",
        message: `Échec de connexion au routeur ${router.name}: ${error.message}`,
      }
    });

    await createRouterOfflineAlert(router, error.message);
    
    return false;
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
  const router = await prisma.router.findUnique({ where: { id: routerId } });
  if (!router) throw new Error("Router introuvable");

  const client = await connectRouter(router);
  try {
    if (isMockMode) {
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
