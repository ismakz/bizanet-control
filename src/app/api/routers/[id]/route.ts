import { NextResponse } from "next/server";
import { z } from "zod";
import { Role, RouterStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";

function isMissingColumnError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2022"
  );
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  host: z.string().min(3).max(120).optional(),
  apiPort: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(120).optional(),
  password: z.string().max(200).optional(),
  location: z.string().max(200).optional().nullable(),
  networkMode: z.enum(["mock", "live"]).optional(),
  status: z.nativeEnum(RouterStatus).optional(),
});

function detailsFromError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown_error";
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const routerId = String(params?.id || "").trim();
    if (!routerId) {
      return NextResponse.json(
        { ok: false, error: "ID routeur manquant", details: "missing_router_id" },
        { status: 400 }
      );
    }

    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const existing = await prisma.router.findUnique({
      where: { id: routerId },
      select: { id: true, companyId: true, name: true, encryptedPassword: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Router introuvable", details: "router_not_found" },
        { status: 404 }
      );
    }
    assertCompanyAccess(auth, existing.companyId);

    const body = await req.json();
    const parsed = patchSchema.parse(body);
    const passwordToApply = parsed.password?.trim();
    const canEditNetworkMode =
      auth.role === Role.BIZANET_CEO || process.env.ALLOW_COMPANY_ADMIN_ROUTER_MODE_EDIT === "true";

    let router: Record<string, unknown>;
    try {
      router = await prisma.router.update({
        where: { id: routerId },
        data: {
          name: parsed.name,
          host: parsed.host,
          apiPort: parsed.apiPort,
          username: parsed.username,
          location: parsed.location,
          networkMode: canEditNetworkMode ? parsed.networkMode : undefined,
          status: parsed.status,
          encryptedPassword: passwordToApply ? encrypt(passwordToApply) : undefined,
        },
        select: {
          id: true,
          companyId: true,
          name: true,
          host: true,
          apiPort: true,
          username: true,
          location: true,
          networkMode: true,
          status: true,
          lastSeenAt: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      const legacyRouter = await prisma.router.update({
        where: { id: routerId },
        data: {
          name: parsed.name,
          host: parsed.host,
          username: parsed.username,
          status: parsed.status,
          encryptedPassword: passwordToApply ? encrypt(passwordToApply) : undefined,
        },
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
      router = {
        ...legacyRouter,
        apiPort: 8728,
        location: null,
        networkMode: null,
        lastSeenAt: null,
      };
    }

    await writeAuditLog({
      auth,
      companyId: existing.companyId,
      action: "ROUTER_UPDATED",
      entityType: "Router",
      message: `Router updated: ${existing.name}`,
    });

    if (passwordToApply) {
      await writeAuditLog({
        auth,
        companyId: existing.companyId,
        action: "ROUTER_PASSWORD_CHANGED",
        entityType: "Router",
        message: `Router password replaced: ${existing.name}`,
      });
    }

    return NextResponse.json({ ok: true, router });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      const details = e.issues.map((i) => i.message).join(", ");
      return NextResponse.json(
        { ok: false, error: "Payload invalide", details },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Authentification requise", details: e.message },
        { status: 401 }
      );
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json(
        { ok: false, error: "Accès refusé", details: e.message },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Impossible de modifier le router", details: detailsFromError(e) },
      { status: 500 }
    );
  }
}
