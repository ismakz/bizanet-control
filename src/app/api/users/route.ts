import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { getTenantWhere, resolveWriteCompanyId } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const createUserSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6).max(200),
  role: z.nativeEnum(Role),
  companyId: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);

    const where = auth.role === Role.BIZANET_CEO ? {} : getTenantWhere(auth);
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({ users });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les utilisateurs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const body = await req.json();
    const parsed = createUserSchema.parse(body);
    const passwordHash = await bcrypt.hash(parsed.password, 10);
    const companyId = parsed.role === Role.BIZANET_CEO ? null : resolveWriteCompanyId(auth, parsed.companyId);

    if (auth.role === Role.COMPANY_ADMIN && parsed.role !== Role.COMPANY_AGENT) {
      return NextResponse.json({ error: "Les admins ne peuvent créer que des agents" }, { status: 403 });
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: parsed.phone } });
    if (existingPhone) {
      return NextResponse.json({ error: "Ce numéro est déjà utilisé" }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        companyId,
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email ?? null,
        passwordHash,
        role: parsed.role,
        ...((parsed.role === Role.COMPANY_AGENT || parsed.role === Role.COMPANY_ADMIN) && companyId ? {
          wallet: {
            create: {
              companyId,
              balance: 0
            }
          }
        } : {})
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
      companyId,
      action: "USER_CREATED",
      entityType: "User",
      message: `User created: ${user.fullName}`,
    });

    return NextResponse.json({ user }, { status: 201 });
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
    return NextResponse.json({ error: "Impossible de créer l'utilisateur" }, { status: 500 });
  }
}
