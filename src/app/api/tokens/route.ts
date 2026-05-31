import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  TokenStatus,
  CustomerStatus,
  Role,
  PaymentMethod,
  PaymentStatus,
  TransactionType,
  TransactionSource,
  AccessType,
} from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import {
  AGENT_OFFLINE_MESSAGE,
  buildTokenHotspotCredentials,
  createHotspotUserOnAgent,
} from "@/lib/mikrotik-agent";
import { canRunHotspotSync, syncHotspotSessions } from "@/lib/mikrotik";
import { durationToSeconds } from "@/lib/time";

function isMissingColumnError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as any).code === "P2022"
  );
}

function generateToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 1, I, 0, O
  let token = "BN-";
  for (let i = 0; i < 4; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  token += "-";
  for (let i = 0; i < 4; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

const generateTokensSchema = z.object({
  planId: z.string().cuid(),
  quantity: z.number().int().min(1).max(100),
  routerId: z.string().cuid().optional(),
  markAsPaid: z.boolean().default(false),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  isQuickSale: z.boolean().optional()
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const tenantWhere = getTenantWhere(auth);

    const agentWhere = auth.role === Role.COMPANY_AGENT ? { generatedByUserId: auth.userId } : {};

    try {
      const { runExpirationEnforcer } = await import(
        "@/lib/mikrotik-expiration-enforcer"
      );
      await runExpirationEnforcer(auth.companyId ?? undefined);
      if (canRunHotspotSync()) {
        await syncHotspotSessions(auth.companyId ?? undefined);
      }
    } catch (syncErr) {
      if (!isMissingColumnError(syncErr)) {
        console.error("[TOKENS API ERROR]", syncErr);
      }
    }

    const tokens = await prisma.accessToken.findMany({
      where: { ...tenantWhere, ...agentWhere },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true, durationValue: true, durationUnit: true, downloadLimitMbps: true, uploadLimitMbps: true, accessType: true } },
        assignedCustomer: { select: { fullName: true, username: true, expiresAt: true } },
        generatedByUser: { select: { fullName: true } },
        company: { select: { name: true, city: true, ownerPhone: true } }
      }
    });
    const now = Date.now();
    const enriched = tokens.map((t) => {
      const startedAt = t.activatedAt;
      const totalSeconds = t.totalSeconds ?? 0;
      const consumedSeconds = t.consumedSeconds ?? 0;
      const baseRemainingSeconds =
        t.remainingSeconds && t.remainingSeconds > 0
          ? t.remainingSeconds
          : Math.max(0, totalSeconds - consumedSeconds);
      const onlineElapsed =
        t.isOnline && t.lastConnectedAt
          ? Math.max(
              0,
              Math.floor((now - new Date(t.lastConnectedAt).getTime()) / 1000)
            )
          : 0;
      const remainingSeconds = t.isOnline
        ? Math.max(0, baseRemainingSeconds - onlineElapsed)
        : baseRemainingSeconds;
      const remainingMs = remainingSeconds * 1000;

      let displayStatus: "UNUSED" | "ACTIVE" | "OFFLINE" | "EXPIRED" = "UNUSED";
      const started = Boolean(t.activatedAt || t.firstActivatedAt || t.consumedSeconds > 0);
      if (t.status === "EXPIRED" || remainingSeconds <= 0) {
        displayStatus = "EXPIRED";
      } else if (!started) {
        displayStatus = "UNUSED";
      } else if (t.isOnline) {
        displayStatus = "ACTIVE";
      } else {
        displayStatus = "OFFLINE";
      }

      return {
        ...t,
        startedAt,
        displayStatus,
        remainingMs,
        mikrotikState:
          t.status === "EXPIRED" || displayStatus === "EXPIRED"
            ? "OFFLINE"
            : t.isOnline
              ? "ONLINE"
              : "OFFLINE",
      };
    });

    return NextResponse.json({ tokens: enriched });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (isMissingColumnError(e)) {
      try {
        const auth = await getAuthContextFromRequest(req);
        const tenantWhere = getTenantWhere(auth);
        const agentWhere = auth.role === Role.COMPANY_AGENT ? { generatedByUserId: auth.userId } : {};
        const legacyTokens = await prisma.accessToken.findMany({
          where: { ...tenantWhere, ...agentWhere },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            token: true,
            status: true,
            price: true,
            currency: true,
            createdAt: true,
            activatedAt: true,
            expiresAt: true,
            boundDeviceId: true,
            firstActivatedAt: true,
            plan: { select: { name: true, durationValue: true, durationUnit: true, downloadLimitMbps: true, uploadLimitMbps: true, accessType: true } },
            assignedCustomer: { select: { fullName: true, username: true, expiresAt: true } },
            generatedByUser: { select: { fullName: true } },
            company: { select: { name: true, city: true, ownerPhone: true } },
          },
        });
        const fallback = legacyTokens.map((t) => ({
          ...t,
          displayStatus: t.status === "EXPIRED" ? "EXPIRED" : t.status === "ACTIVE" ? "ACTIVE" : t.status === "UNUSED" ? "UNUSED" : "OFFLINE",
          remainingMs: 0,
          mikrotikState: "OFFLINE",
          warning: "migration_incomplete",
        }));
        return NextResponse.json({ tokens: fallback, warning: "migration_incomplete" });
      } catch (legacyErr) {
        console.error("[TOKENS API ERROR]", legacyErr);
      }
    }
    console.error("[TOKENS API ERROR]", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: "Erreur serveur", detail }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);
    
    if (!auth.companyId) {
      return NextResponse.json({ error: "CompanyId manquant" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = generateTokensSchema.parse(body);

    const plan = await prisma.plan.findFirst({
      where: { id: parsed.planId, companyId: auth.companyId }
    });

    if (!plan) {
      return NextResponse.json({ error: "Forfait introuvable" }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { id: auth.companyId }
    });

    if (!company) {
      return NextResponse.json({ error: "Company introuvable" }, { status: 404 });
    }

    const totalPrice = Number(plan.price) * parsed.quantity;

    if (auth.role === Role.COMPANY_AGENT) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet || Number(wallet.balance) < totalPrice) {
        return NextResponse.json({ error: "Solde insuffisant. Demandez une recharge à votre administrateur." }, { status: 400 });
      }
    }

    const newTokens: import("@prisma/client").AccessToken[] = [];
    
    // We run this in a transaction to ensure all tokens and payments are created together
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < parsed.quantity; i++) {
        let uniqueToken = "";
        let isUnique = false;
        // Simple uniqueness check loop (in real-world, might want to generate bulk and check)
        while (!isUnique) {
          uniqueToken = generateToken();
          const existing = await tx.accessToken.findUnique({ where: { token: uniqueToken } });
          if (!existing) isUnique = true;
        }

        const now = new Date();
        const totalSeconds =
          plan.accessType === AccessType.HOTSPOT_WIFI
            ? durationToSeconds(plan.durationValue, plan.durationUnit as any)
            : 0;

        let assignedCustomerId: string | null = null;
        if (plan.accessType === AccessType.HOTSPOT_WIFI) {
          const existingCustomer = await tx.customer.findFirst({
            where: { companyId: auth.companyId!, username: uniqueToken },
            select: { id: true },
          });

          if (existingCustomer) {
            assignedCustomerId = existingCustomer.id;
          } else {
            const createdCustomer = await tx.customer.create({
              data: {
                companyId: auth.companyId!,
                fullName: `Ticket ${uniqueToken}`,
                phone: "",
                username: uniqueToken,
                password: uniqueToken,
                status: CustomerStatus.PENDING,
                expiresAt: new Date(now.getTime() + Math.max(totalSeconds, 3600) * 1000),
                routerId: parsed.routerId ?? null,
                accessType: AccessType.HOTSPOT_WIFI,
              },
              select: { id: true },
            });
            assignedCustomerId = createdCustomer.id;
          }
        }

        let accessToken;
        try {
          accessToken = await tx.accessToken.create({
            data: {
              companyId: auth.companyId!,
              planId: plan.id,
              routerId: parsed.routerId,
              token: uniqueToken,
              status: TokenStatus.UNUSED,
              assignedCustomerId,
              generatedByUserId: auth.userId,
              price: plan.price,
              currency: company.currency,
              accessType: plan.accessType,
              totalSeconds,
              remainingSeconds: totalSeconds,
              consumedSeconds: 0,
              isOnline: false,
            }
          });
        } catch (createErr) {
          if (!isMissingColumnError(createErr)) throw createErr;
          accessToken = await tx.accessToken.create({
            data: {
              companyId: auth.companyId!,
              planId: plan.id,
              routerId: parsed.routerId,
              token: uniqueToken,
              status: TokenStatus.UNUSED,
              assignedCustomerId,
              generatedByUserId: auth.userId,
              price: plan.price,
              currency: company.currency,
              accessType: plan.accessType,
            },
          });
        }

        if (parsed.markAsPaid && parsed.paymentMethod) {
          await tx.payment.create({
            data: {
              companyId: auth.companyId!,
              planId: plan.id,
              amount: plan.price,
              method: parsed.paymentMethod,
              status: PaymentStatus.APPROVED,
              createdByUserId: auth.userId,
              accessTokenId: accessToken.id
            }
          });
        }

        newTokens.push(accessToken);
      }

      if (auth.role === Role.COMPANY_AGENT) {
        const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
        if (!wallet || Number(wallet.balance) < totalPrice) {
          throw new Error("INSUFFICIENT_FUNDS");
        }
        
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalPrice } }
        });

        await tx.walletTransaction.create({
          data: {
            walletId: updatedWallet.id,
            userId: auth.userId,
            companyId: auth.companyId!,
            amount: totalPrice,
            type: TransactionType.DEBIT,
            source: TransactionSource.TOKEN_SALE,
            reference: `Vente de ${parsed.quantity} token(s) ${plan.name}`,
            status: "APPROVED",
            createdByUserId: auth.userId
          }
        });
      }
    });

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: parsed.isQuickSale ? "QUICK_SALE_CREATED" : "TOKENS_GENERATED",
      entityType: "AccessToken",
      message: parsed.isQuickSale 
        ? `Vente rapide d'un token pour le forfait ${plan.name}` 
        : `${parsed.quantity} tokens générés pour le forfait ${plan.name}`,
    });

    const mikrotikResults: {
      token: string;
      ok: boolean;
      error?: string;
    }[] = [];

    if (plan.accessType === AccessType.HOTSPOT_WIFI) {
      const saleLabel = parsed.isQuickSale ? "Quick Sale" : "Token Generate";

      for (const accessToken of newTokens) {
        const credentials = buildTokenHotspotCredentials(accessToken.token);

        console.log("[Quick Sale MikroTik] request", {
          context: saleLabel,
          tokenId: accessToken.id,
          token: accessToken.token,
          profile: credentials.profile,
          agentPayload: {
            username: credentials.username,
            password: credentials.password,
            profile: credentials.profile,
            comment: credentials.comment,
          },
        });

        const agentResult = await createHotspotUserOnAgent(
          credentials,
          `${saleLabel} token:${accessToken.token}`
        );

        if (!agentResult.ok) {
          console.error("[MikroTik Error]", {
            context: saleLabel,
            token: accessToken.token,
            error: agentResult.error,
            agent: agentResult.data,
          });

          mikrotikResults.push({
            token: accessToken.token,
            ok: false,
            error: agentResult.error,
          });

          continue;
        }

        mikrotikResults.push({
          token: accessToken.token,
          ok: true,
        });
      }
    }

    const mikrotikSynced =
      mikrotikResults.length > 0 && mikrotikResults.every((r) => r.ok);
    const failedMikrotik = mikrotikResults.filter((r) => !r.ok);
    const agentOffline = failedMikrotik.some(
      (r) =>
        r.error === AGENT_OFFLINE_MESSAGE ||
        Boolean(r.error?.toLowerCase().includes("hors ligne"))
    );
    const mikrotikWarning = mikrotikSynced
      ? undefined
      : agentOffline
        ? AGENT_OFFLINE_MESSAGE
        : failedMikrotik
            .map((r) => r.error)
            .filter(Boolean)
            .join(" — ") || "Synchronisation MikroTik non effectuée";

    return NextResponse.json(
      {
        success: true,
        count: newTokens.length,
        tokens: newTokens.map((t) => ({ ...t, plan, company })),
        agentOffline: agentOffline || undefined,
        agentMessage: mikrotikWarning,
        mikrotik:
          mikrotikResults.length > 0
            ? {
                synced: mikrotikSynced,
                results: mikrotikResults,
                agentOffline,
                message: mikrotikWarning,
              }
            : { synced: false, reason: "accessType not HOTSPOT_WIFI" },
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map(i => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
      return NextResponse.json({ error: "Solde insuffisant." }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    console.error("[TOKENS API ERROR]", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: "Impossible de générer les tokens", detail }, { status: 500 });
  }
}
