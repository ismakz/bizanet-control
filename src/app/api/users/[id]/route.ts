import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().min(3).max(40).optional(),
  email: z.string().email().nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(6).max(200).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const body = await req.json();
    const parsed = updateUserSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, role: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    if (auth.role !== Role.BIZANET_CEO && existing.companyId) {
      assertCompanyAccess(auth, existing.companyId);
    }

    if (auth.role === Role.COMPANY_ADMIN && parsed.role === Role.BIZANET_CEO) {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }

    const passwordHash = parsed.password ? await bcrypt.hash(parsed.password, 10) : undefined;

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email,
        role: parsed.role,
        passwordHash,
      },
      select: {
        id: true,
        companyId: true,
        fullName: true,
        phone: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      auth,
      companyId: user.companyId,
      action: "USER_UPDATED",
      entityType: "User",
      message: `User updated: ${user.fullName}`,
    });

    return NextResponse.json({ user });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de modifier l'utilisateur" }, { status: 500 });
  }
}
