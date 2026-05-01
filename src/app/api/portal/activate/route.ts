import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TokenStatus, CustomerStatus, SubscriptionStatus, AccessType } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { 
  createHotspotUser, 
  getDhcpLeases, 
  createDhcpMacBinding, 
  activateWiredClient, 
  createPppoeSecret 
} from "@/lib/mikrotik";

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
    let finalMacAddress = parsed.macAddress;

    // Detection MAC logic for Wired Ethernet
    if (accessType === "WIRED_ETHERNET" && !finalMacAddress) {
      if (!accessToken.routerId) {
        return NextResponse.json({ error: "Aucun routeur associé à ce token pour détecter la MAC." }, { status: 400 });
      }
      const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || req.headers.get("x-real-ip") || "127.0.0.1";
      const leases = await getDhcpLeases(accessToken.routerId);
      const matchingLease = leases.find((l: any) => l.address === clientIp);
      
      if (matchingLease && matchingLease["mac-address"]) {
        finalMacAddress = matchingLease["mac-address"];
      } else {
        return NextResponse.json({ error: "MAC_NOT_DETECTED" }, { status: 400 });
      }
    }

    const now = new Date();

    // 2. Vérification du Device Binding si le token est déjà actif
    if (accessToken.status === TokenStatus.ACTIVE) {
      if (accessToken.boundDeviceId && accessToken.boundDeviceId !== parsed.deviceId) {
        // Mettre le token sous surveillance
        await prisma.accessToken.update({
          where: { id: accessToken.id },
          data: { riskLevel: "WATCH" }
        });

        // Log la tentative échouée
        await writeAuditLog({
          companyId: accessToken.companyId,
          action: "DEVICE_MISMATCH_BLOCKED",
          entityType: "AccessToken",
          message: `Tentative d'utilisation du token ${tokenStr} sur un nouvel appareil (${parsed.deviceId}) refusée.`
        });
        return NextResponse.json({ error: "DEVICE_MISMATCH" }, { status: 403 });
      }

      // Si c'est le MÊME appareil, on lui redonne ses accès sans recréer le compte
      const existingCustomer = await prisma.customer.findFirst({
        where: { username: tokenStr, companyId: accessToken.companyId }
      });

      if (existingCustomer) {
        // Mettre à jour lastSeenAt
        const device = await prisma.customerDevice.findFirst({
          where: { accessTokenId: accessToken.id, deviceId: parsed.deviceId }
        });
        if (device) {
          await prisma.customerDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: now }
          });
        }
        await prisma.accessToken.update({
          where: { id: accessToken.id },
          data: { lastDeviceCheckAt: now }
        });

        return NextResponse.json({ 
          success: true, 
          message: "Accès récupéré avec succès",
          expiresAt: existingCustomer.expiresAt,
          username: existingCustomer.username,
          password: existingCustomer.password,
          planName: accessToken.plan.name
        }, { status: 200 });
      }
    }

    if (accessToken.status !== TokenStatus.UNUSED) {
      return NextResponse.json({ error: "Ce code d'accès est invalide ou a expiré." }, { status: 400 });
    }

    // 3. Nouvelle Activation : Création du EndCustomer minimal
    const { calculateExpiration } = await import("@/lib/time");
    const expiresAt = calculateExpiration(now, accessToken.plan.durationValue, accessToken.plan.durationUnit as any);

    const customer = await prisma.customer.create({
      data: {
        companyId: accessToken.companyId,
        username: tokenStr,
        password: tokenStr,
        status: CustomerStatus.ACTIVE,
        expiresAt,
        phone: parsed.phone || null,
        fullName: `Client Token ${tokenStr}`,
        routerId: accessToken.routerId,
        accessType
      }
    });

    // 4. Création du CustomerDevice (Device Binding)
    await prisma.customerDevice.create({
      data: {
        companyId: accessToken.companyId,
        customerId: customer.id,
        accessTokenId: accessToken.id,
        deviceId: parsed.deviceId,
        userAgent: parsed.userAgent,
        phone: parsed.phone,
        firstSeenAt: now,
        lastSeenAt: now
      }
    });

    // 5. Création de la souscription
    const subscription = await prisma.internetSubscription.create({
      data: {
        companyId: accessToken.companyId,
        customerId: customer.id,
        planId: accessToken.planId,
        routerId: accessToken.routerId,
        startedAt: now,
        expiresAt: expiresAt,
        status: SubscriptionStatus.ACTIVE,
        networkActivationStatus: "PENDING"
      }
    });

    // 6. Network Activation
    let activationSuccess = false;
    try {
      if (accessType === "HOTSPOT_WIFI") {
        await createHotspotUser(customer.id);
        activationSuccess = true;
      } else if (accessType === "WIRED_ETHERNET") {
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || "127.0.0.1";
        await createDhcpMacBinding(accessToken.routerId!, finalMacAddress!, clientIp);
        await activateWiredClient(customer.id, finalMacAddress!);
        activationSuccess = true;
      } else if (accessType === "PPPOE") {
        await createPppoeSecret(customer.id);
        activationSuccess = true;
      }
      
      if (activationSuccess) {
        await prisma.internetSubscription.update({
          where: { id: subscription.id },
          data: { networkActivationStatus: "SUCCESS" }
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

    // 7. Mettre à jour le Token avec le DeviceId
    await prisma.accessToken.update({
      where: { id: accessToken.id },
      data: {
        status: TokenStatus.ACTIVE,
        assignedCustomerId: customer.id,
        activatedAt: now,
        usedAt: now,
        boundDeviceId: parsed.deviceId,
        firstActivatedAt: now,
        lastDeviceCheckAt: now
      }
    });

    await writeAuditLog({
      companyId: accessToken.companyId,
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
      planName: accessToken.plan.name
    }, { status: 200 });

  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Une erreur s'est produite lors de l'activation." }, { status: 500 });
  }
}
