import { NextResponse } from "next/server";
import { z } from "zod";
import { Role, RouterStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  host: z.string().min(3).max(120).optional(),
  username: z.string().min(1).max(120).optional(),
  password: z.string().min(1).max(200).optional(),
  status: z.nativeEnum(RouterStatus).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const existing = await prisma.router.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Router introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, existing.companyId);

    const body = await req.json();
    const parsed = patchSchema.parse(body);
    const router = await prisma.router.update({
      where: { id: params.id },
      data: {
        name: parsed.name,
        host: parsed.host,
        username: parsed.username,
        status: parsed.status,
        encryptedPassword: parsed.password ? encrypt(parsed.password) : undefined,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        host: true,
        username: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      auth,
      companyId: existing.companyId,
      action: "ROUTER_UPDATED",
      entityType: "Router",
      message: `Router updated: ${existing.name}`,
    });

    return NextResponse.json({ router });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "UNAUTHENTICATED" || e.message.startsWith("FORBIDDEN"))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de modifier le router" }, { status: 500 });
  }
}
