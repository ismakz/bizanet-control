import { NextResponse } from "next/server";
import { z } from "zod";
import { ensurePrismaConnection, prisma } from "@/lib/prisma";
import { isCloudRouterBlocked } from "@/lib/router-access";
import { TokenStatus, CustomerStatus, SubscriptionStatus, AccessType } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import {
  createHotspotUser,
  activateUser,
  syncHotspotSessions,
  syncTokenHotspotStatus,
  getDhcpLeases, 
  createDhcpMacBinding, 
  activateWiredClient, 
  createPppoeSecret 
} from "@/lib/mikrotik";
import { durationToSeconds } from "@/lib/time";

const activateTokenSchema = z.object({
  token: z.string().min(1),
  phone: z.string().optional(),
  deviceId: z.string().min(1),
  userAgent: z.string().optional(),
  macAddress: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = activateTokenSchema.parse(body);
    const tokenStr = parsed.token.toUpperCase().trim();

    // 1. Chercher le token
    const accessToken = await prisma.accessToken.findUnique({
      where: { token: tokenStr },
      include: {
        plan: true,
        company: true
      }
    });

    if (!accessToken) {
      return NextResponse.json({ error: "Code d'accès invalide." }, { status: 404 });
    }

    if (accessToken.riskLevel === "BLOCKED") {
      return NextResponse.json({ error: "Ce code a été bloqué suite à une activité suspecte. Veuillez contacter le support." }, { status: 403 });
    }

    const accessType = accessToken.plan.accessType || "HOTSPOT_WIFI";
    if (accessType === "HOTSPOT_WIFI" && !isCloudRouterBlocked()) {
      await syncHotspotSessions(accessToken.companyId);
    }

    const freshToken = await prisma.accessToken.findUnique({
      where: { id: accessToken.id },
      include: { plan: true, company: true },
    });
    if (!freshToken) {
      return NextResponse.json({ error: "Code d'accès invalide." }, { status: 404 });
    }
    if (freshToken.status === TokenStatus.EXPIRED) {
      return NextResponse.json({ error: "Ce ticket est expiré." }, { status: 400 });
    }

    let finalMacAddress = parsed.macAddress;

    // Detection MAC logic for Wired Ethernet
    if (accessType === "WIRED_ETHERNET" && !finalMacAddress) {
      if (!freshToken.routerId) {
        return NextResponse.json({ error: "Aucun routeur associé à ce token pour détecter la MAC." }, { status: 400 });
      }
      const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || req.headers.get("x-real-ip") || "127.0.0.1";
      const leases = await getDhcpLeases(freshToken.routerId);
      const matchingLease = leases.find((l: any) => l.address === clientIp);
      
      if (matchingLease && matchingLease["mac-address"]) {
        finalMacAddress = matchingLease["mac-address"];
      } else {
        return NextResponse.json({ error: "MAC_NOT_DETECTED" }, { status: 400 });
      }
    }

    const now = new Date();

    // 2. Vérification du Device Binding si le token est déjà utilisé / connecté
    if (
      freshToken.status === TokenStatus.ACTIVE ||
      freshToken.status === TokenStatus.USED
    ) {
      if (freshToken.boundDeviceId && freshToken.boundDeviceId !== parsed.deviceId) {
        // Mettre le token sous surveillance
        await prisma.accessToken.update({
          where: { id: freshToken.id },
          data: { riskLevel: "WATCH" }
        });

        // Log la tentative échouée
        await writeAuditLog({
          companyId: freshToken.companyId,
          action: "DEVICE_MISMATCH_BLOCKED",
          entityType: "AccessToken",
          message: `Tentative d'utilisation du token ${tokenStr} sur un nouvel appareil (${parsed.deviceId}) refusée.`
        });
        return NextResponse.json({ error: "DEVICE_MISMATCH" }, { status: 403 });
      }

      // Si c'est le MÊME appareil, on lui redonne ses accès sans recréer le compte
      const existingCustomer = await prisma.customer.findFirst({
        where: { username: tokenStr, companyId: freshToken.companyId }
      });

      if (existingCustomer) {
        // Mettre à jour lastSeenAt
        const device = await prisma.customerDevice.findFirst({
          where: { accessTokenId: freshToken.id, deviceId: parsed.deviceId }
        });
        if (device) {
          await prisma.customerDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: now }
          });
        }
        await prisma.accessToken.update({
          where: { id: freshToken.id },
          data: { lastDeviceCheckAt: now }
        });

        return NextResponse.json({ 
          success: true, 
          message: "Accès récupéré avec succès",
          expiresAt: existingCustomer.expiresAt,
          username: existingCustomer.username,
          password: existingCustomer.password,
          planName: freshToken.plan.name
        }, { status: 200 });
      }
    }

    if (freshToken.status !== TokenStatus.UNUSED) {
      return NextResponse.json({ error: "Ce code d'accès est invalide ou a expiré." }, { status: 400 });
    }

    // 3. Nouvelle Activation : Créer le customer si absent, sinon réutiliser celui lié au ticket
    const { calculateExpiration } = await import("@/lib/time");
    const expiresAt = calculateExpiration(now, freshToken.plan.durationValue, freshToken.plan.durationUnit as any);
    const customer = freshToken.assignedCustomerId
      ? await prisma.customer.update({
          where: { id: freshToken.assignedCustomerId },
          data: {
            phone: parsed.phone || undefined,
            status: CustomerStatus.PENDING,
            expiresAt,
            routerId: freshToken.routerId,
          },
        })
      : await prisma.customer.create({
          data: {
            companyId: freshToken.companyId,
            username: tokenStr,
            password: tokenStr,
            status: CustomerStatus.PENDING,
            expiresAt,
            phone: parsed.phone || null,
            fullName: `Client Token ${tokenStr}`,
            routerId: freshToken.routerId,
            accessType
          }
        });

    // 4. Création du CustomerDevice (Device Binding)
    const existingDevice = await prisma.customerDevice.findFirst({
      where: {
        accessTokenId: freshToken.id,
        deviceId: parsed.deviceId,
      },
      select: { id: true },
    });
    if (existingDevice) {
      await prisma.customerDevice.update({
        where: { id: existingDevice.id },
        data: {
          customerId: customer.id,
          lastSeenAt: now,
          phone: parsed.phone || undefined,
          userAgent: parsed.userAgent || undefined,
          isActive: true,
        },
      });
    } else {
      await prisma.customerDevice.create({
        data: {
          companyId: freshToken.companyId,
          customerId: customer.id,
          accessTokenId: freshToken.id,
          deviceId: parsed.deviceId,
          userAgent: parsed.userAgent,
          phone: parsed.phone,
          firstSeenAt: now,
          lastSeenAt: now
        }
      });
    }

    // 5. Création de la souscription
    const subscription = await prisma.internetSubscription.create({
      data: {
        companyId: freshToken.companyId,
        customerId: customer.id,
        planId: freshToken.planId,
        routerId: freshToken.routerId,
        startedAt: now,
        expiresAt: expiresAt,
        status: SubscriptionStatus.ACTIVE,
        networkActivationStatus: "PENDING"
      }
    });

    // 6. Network Activation
    let activationSuccess = false;
    let hotspotConnected = false;
    try {
      if (accessType === "HOTSPOT_WIFI") {
        await createHotspotUser(customer.id);
        const activation = await activateUser(customer.id);
        hotspotConnected = activation.connected;
        activationSuccess = true;
      } else if (accessType === "WIRED_ETHERNET") {
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || "127.0.0.1";
        await createDhcpMacBinding(freshToken.routerId!, finalMacAddress!, clientIp);
        await activateWiredClient(customer.id, finalMacAddress!);
        activationSuccess = true;
      } else if (accessType === "PPPOE") {
        await createPppoeSecret(customer.id);
        activationSuccess = true;
      }
      
      if (activationSuccess) {
        await prisma.internetSubscription.update({
          where: { id: subscription.id },
          data: {
            networkActivationStatus:
              accessType === "HOTSPOT_WIFI" && !hotspotConnected ? "PENDING" : "SUCCESS",
          },
        });
      }
    } catch (networkErr: any) {
      console.error("Network activation failed during portal activate:", networkErr);
      await prisma.internetSubscription.update({
        where: { id: subscription.id },
        data: { networkActivationStatus: "FAILED" }
      });
      // Non bloquant : Le compte est créé, on peut réessayer via le dashboard.
    }

    const totalSeconds =
      accessType === "HOTSPOT_WIFI"
        ? durationToSeconds(freshToken.plan.durationValue, freshToken.plan.durationUnit as any)
        : 0;

    await ensurePrismaConnection();

    // 7. Mettre à jour le Token avec le DeviceId
    await prisma.accessToken.update({
      where: { id: freshToken.id },
      data: {
        status: hotspotConnected ? TokenStatus.ACTIVE : TokenStatus.USED,
        assignedCustomerId: customer.id,
        activatedAt: hotspotConnected ? now : null,
        usedAt: now,
        boundDeviceId: parsed.deviceId,
        firstActivatedAt: now,
        lastDeviceCheckAt: now,
        totalSeconds,
        remainingSeconds: totalSeconds,
        consumedSeconds: 0,
        isOnline: hotspotConnected,
        lastConnectedAt: hotspotConnected ? now : null,
        lastDisconnectedAt: hotspotConnected ? null : now,
        expiredAt: null,
      }
    });

    if (accessType === "HOTSPOT_WIFI") {
      await syncTokenHotspotStatus(freshToken.id).catch((err) =>
        console.error("syncTokenHotspotStatus after portal activate:", err)
      );
    }

    await writeAuditLog({
      companyId: freshToken.companyId,
      action: "TOKEN_BOUND_TO_DEVICE",
      entityType: "AccessToken",
      message: `Token ${tokenStr} lié à l'appareil ${parsed.deviceId}`
    });

    return NextResponse.json({ 
      success: true, 
      message: "Accès activé avec succès",
      expiresAt: expiresAt,
      username: customer.username,
      password: customer.password,
      planName: freshToken.plan.name
    }, { status: 200 });

  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Une erreur s'est produite lors de l'activation." }, { status: 500 });
  }
}
