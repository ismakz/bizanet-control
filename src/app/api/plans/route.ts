import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Role, DurationUnit, AccessType } from "@prisma/client";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getTenantWhere, requireOneOfRoles, resolveWriteCompanyId } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

const planSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.coerce.number().positive(),
  durationValue: z.coerce.number().int().positive(),
  durationUnit: z.nativeEnum(DurationUnit),
  accessType: z.nativeEnum(AccessType),
  downloadLimitMbps: z.coerce.number().int().positive(),
  uploadLimitMbps: z.coerce.number().int().positive()
});

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const plans = await prisma.plan.findMany({
      where: getTenantWhere(auth),
      include: { company: { select: { currency: true } } },
      orderBy: { createdAt: "desc" }
    });

    let currency = "USD";
    if (auth.companyId) {
      const company = await prisma.company.findUnique({ where: { id: auth.companyId }, select: { currency: true } });
      if (company) currency = company.currency;
    } else if (plans.length > 0 && plans[0].company?.currency) {
      currency = plans[0].company.currency;
    }

    return NextResponse.json({ plans, currency });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.COMPANY_ADMIN]);

    const body = await req.json();
    const parsed = planSchema.parse(body);
    const requestedCompanyId =
      typeof body?.companyId === "string" && body.companyId.length > 0 ? body.companyId : null;
    const companyId = resolveWriteCompanyId(auth, requestedCompanyId);

    const plan = await prisma.plan.create({
      data: {
        companyId,
        name: parsed.name,
        price: parsed.price,
        durationValue: parsed.durationValue,
        durationUnit: parsed.durationUnit,
        accessType: parsed.accessType,
        downloadLimitMbps: parsed.downloadLimitMbps,
        uploadLimitMbps: parsed.uploadLimitMbps
      }
    });

    await writeAuditLog({
      auth,
      companyId,
      action: "PLAN_CREATED",
      entityType: "Plan",
      message: `Plan created: ${plan.name}`,
    });

    return NextResponse.json({ plan }, { status: 201 });
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
    return NextResponse.json({ error: "Impossible de créer le plan" }, { status: 500 });
  }
}

