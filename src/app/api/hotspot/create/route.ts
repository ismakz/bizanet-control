import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { createHotspotUserOnAgent } from "@/lib/mikrotik-agent";

const DEFAULT_PROFILE = "default";
const DEFAULT_COMMENT = "created-from-bizanet-control";

type CreateBody = {
  customerId?: string;
  profile?: string;
  username?: string;
  password?: string;
  comment?: string;
};

type AgentPayload = {
  username: string;
  password: string;
  profile: string;
  comment: string;
};

type SafeCustomer = {
  id: string;
  companyId: string;
  fullName: string | null;
  phone: string | null;
  username: string;
  status: string;
  hotspotEnabled: boolean;
  hotspotUsername: string | null;
  hotspotProfile: string | null;
  hotspotCreatedAt: Date | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function normalizePhoneSpaces(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\s/g, "");
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function buildHotspotCredentials(
  phone: string | null | undefined,
  fallbackUsername: string
): { username: string; password: string } {
  const usernameRaw = normalizePhoneSpaces(phone);
  const username =
    usernameRaw.length > 0 ? usernameRaw : fallbackUsername.trim();

  const digits = digitsOnly(usernameRaw || fallbackUsername);
  let password =
    digits.length >= 6 ? digits.slice(-6) : digits.length > 0 ? digits.padStart(6, "0") : "";

  if (password.length < 6) {
    password = randomBytes(4).toString("hex").slice(0, 8);
  }

  return { username, password };
}

function toSafeCustomer(
  c: {
    id: string;
    companyId: string;
    fullName: string | null;
    phone: string | null;
    username: string;
    status: string;
    hotspotEnabled: boolean;
    hotspotUsername: string | null;
    hotspotProfile: string | null;
    hotspotCreatedAt: Date | null;
  }
): SafeCustomer {
  return {
    id: c.id,
    companyId: c.companyId,
    fullName: c.fullName,
    phone: c.phone,
    username: c.username,
    status: c.status,
    hotspotEnabled: c.hotspotEnabled,
    hotspotUsername: c.hotspotUsername,
    hotspotProfile: c.hotspotProfile,
    hotspotCreatedAt: c.hotspotCreatedAt,
  };
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_ADMIN, Role.BIZANET_CEO]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHENTICATED") {
      return jsonError("Non authentifié", 401);
    }
    if (msg === "FORBIDDEN_ROLE") {
      return jsonError("Accès refusé", 403);
    }
    return jsonError("Non authentifié", 401);
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("Corps JSON invalide", 400);
  }

  const profile =
    typeof body.profile === "string" && body.profile.trim()
      ? body.profile.trim()
      : DEFAULT_PROFILE;
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim()
      : DEFAULT_COMMENT;

  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";

  let agentPayload: AgentPayload;

  if (customerId) {
    let customer;
    try {
      customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          companyId: true,
          fullName: true,
          phone: true,
          username: true,
          status: true,
          hotspotEnabled: true,
          hotspotUsername: true,
          hotspotProfile: true,
          hotspotCreatedAt: true,
        },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur base de données";
      console.error("[MikroTik Error]", "Prisma findUnique", message);
      return jsonError("Erreur lors de la lecture du client", 500);
    }

    if (!customer) {
      return jsonError("Client introuvable", 404);
    }

    try {
      assertCompanyAccess(auth, customer.companyId);
    } catch {
      return jsonError("Accès refusé pour ce client", 403);
    }

    if (customer.hotspotEnabled) {
      return jsonError(
        "Client déjà activé sur MikroTik (hotspot existant). Utilisez la gestion routeur si besoin de recréer.",
        409
      );
    }

    const credentials = buildHotspotCredentials(
      customer.phone,
      customer.username
    );

    if (!credentials.username) {
      return jsonError(
        "Impossible de générer un username hotspot (téléphone ou username client requis)",
        400
      );
    }

    agentPayload = {
      username: credentials.username,
      password: credentials.password,
      profile,
      comment,
    };

    const agentResult = await createHotspotUserOnAgent(
      agentPayload,
      `customer:${customer.id}`
    );
    if (!agentResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: agentResult.error,
          ...(agentResult.data ? { agent: agentResult.data } : {}),
        },
        { status: agentResult.status }
      );
    }

    let updated;
    try {
      updated = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          hotspotUsername: agentPayload.username,
          hotspotPassword: agentPayload.password,
          hotspotProfile: profile,
          hotspotEnabled: true,
          hotspotCreatedAt: new Date(),
        },
        select: {
          id: true,
          companyId: true,
          fullName: true,
          phone: true,
          username: true,
          status: true,
          hotspotEnabled: true,
          hotspotUsername: true,
          hotspotProfile: true,
          hotspotCreatedAt: true,
        },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur base de données";
      console.error("[MikroTik Error]", "Prisma update après agent OK", message);
      return jsonError(
        "Hotspot créé sur MikroTik mais échec de sauvegarde en base",
        500
      );
    }

    await writeAuditLog({
      auth,
      companyId: customer.companyId,
      action: "HOTSPOT_MIKROTIK_CREATED",
      entityType: "Customer",
      message: `Hotspot MikroTik activé pour ${agentPayload.username}`,
    });

    console.log("[Hotspot Success]", {
      customerId: customer.id,
      username: agentPayload.username,
      profile,
    });

    return NextResponse.json({
      success: true,
      customer: toSafeCustomer(updated),
      hotspot: {
        username: agentPayload.username,
        password: agentPayload.password,
        profile,
      },
      agent: agentResult.data,
    });
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password =
    typeof body.password === "string" ? body.password.trim() : "";

  if (!username || !password) {
    return jsonError(
      "Fournissez customerId et profile, ou username et password",
      400
    );
  }

  agentPayload = { username, password, profile, comment };
  const agentResult = await createHotspotUserOnAgent(agentPayload, "direct");

  if (!agentResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: agentResult.error,
        ...(agentResult.data ? { agent: agentResult.data } : {}),
      },
      { status: agentResult.status }
    );
  }

  console.log("[Hotspot Success]", { username, profile, mode: "direct" });

  return NextResponse.json({
    success: true,
    hotspot: {
      username: agentPayload.username,
      password: agentPayload.password,
      profile,
    },
    agent: agentResult.data,
  });
}
