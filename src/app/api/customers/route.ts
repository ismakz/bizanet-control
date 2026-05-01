import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CustomerStatus, Role } from "@prisma/client";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getTenantWhere, requireOneOfRoles, resolveWriteCompanyId } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const createCustomerSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(3).max(40),
  username: z.string().min(2).max(40),
  password: z.string().min(6).max(200),
  status: z.nativeEnum(CustomerStatus),
  expiresAt: z.string().min(1)
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const customers = await prisma.customer.findMany({
      where: getTenantWhere(auth),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyId: true,
        fullName: true,
        phone: true,
        username: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            networkActivationStatus: true
          }
        }
      }
    });

    return NextResponse.json({ customers });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les customers" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    const body = await req.json();
    const parsed = createCustomerSchema.parse(body);
    const requestedCompanyId =
      typeof body?.companyId === "string" && body.companyId.length > 0 ? body.companyId : null;
    const companyId = resolveWriteCompanyId(auth, requestedCompanyId);

    const expiresAt = new Date(parsed.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: "expiresAt invalide" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.password, 10);

    const customer = await prisma.customer.create({
      data: {
        companyId,
        fullName: parsed.fullName,
        phone: parsed.phone,
        username: parsed.username,
        password: passwordHash,
        status: parsed.status,
        expiresAt
      },
      select: {
        id: true,
        companyId: true,
        fullName: true,
        phone: true,
        username: true,
        status: true,
        expiresAt: true,
        createdAt: true
      }
    });

    await writeAuditLog({
      auth,
      companyId,
      action: "CUSTOMER_CREATED",
      entityType: "Customer",
      message: `Customer created: ${customer.username}`,
    });

    return NextResponse.json({ customer }, { status: 201 });
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
    if (e instanceof Error && (e.message === "MISSING_COMPANY" || e.message === "COMPANY_ID_REQUIRED")) {
      return NextResponse.json({ error: "companyId requis" }, { status: 400 });
    }

    // Prisma unique constraint
    return NextResponse.json({ error: "Impossible de créer le customer" }, { status: 500 });
  }
}

