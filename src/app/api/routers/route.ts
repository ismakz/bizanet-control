import { NextResponse } from "next/server";
import { z } from "zod";
import { Role, RouterStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere, resolveWriteCompanyId } from "@/lib/permissions";
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

const createRouterSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(3).max(120),
  apiPort: z.coerce.number().int().min(1).max(65535).default(8728),
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  networkMode: z.enum(["mock", "live"]).optional(),
  status: z.nativeEnum(RouterStatus).optional(),
  companyId: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const where = auth.role === Role.BIZANET_CEO ? {} : getTenantWhere(auth);

    let routers: Array<Record<string, unknown>> = [];
    try {
      routers = await prisma.router.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
      const legacyRouters = await prisma.router.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
      routers = legacyRouters.map((router) => ({
        ...router,
        apiPort: 8728,
        location: null,
        networkMode: null,
        lastSeenAt: null,
      }));
    }

    return NextResponse.json({ routers });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les routers" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);
    const body = await req.json();
    const parsed = createRouterSchema.parse(body);
    const companyId = resolveWriteCompanyId(auth, parsed.companyId);
    const canEditNetworkMode =
      auth.role === Role.BIZANET_CEO || process.env.ALLOW_COMPANY_ADMIN_ROUTER_MODE_EDIT === "true";

    let router: Record<string, unknown>;
    try {
      router = await prisma.router.create({
        data: {
          companyId,
          name: parsed.name,
          host: parsed.host,
          apiPort: parsed.apiPort,
          username: parsed.username,
          encryptedPassword: encrypt(parsed.password),
          location: parsed.location || null,
          networkMode: canEditNetworkMode ? parsed.networkMode ?? null : null,
          status: parsed.status ?? RouterStatus.UNKNOWN,
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
      const legacyRouter = await prisma.router.create({
        data: {
          companyId,
          name: parsed.name,
          host: parsed.host,
          username: parsed.username,
          encryptedPassword: encrypt(parsed.password),
          status: parsed.status ?? RouterStatus.UNKNOWN,
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
      companyId,
      action: "ROUTER_CREATED",
      entityType: "Router",
      message: `Router created: ${router.name}`,
    });

    return NextResponse.json({ router }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "UNAUTHENTICATED" || e.message.startsWith("FORBIDDEN"))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de créer le router" }, { status: 500 });
  }
}
