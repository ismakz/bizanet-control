import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { Role, DurationUnit, AccessType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { assertCompanyAccess, requireOneOfRoles } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { syncPlanOnMikrotik, deletePlanOnMikrotik } from "@/lib/plan-mikrotik";

const planSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.coerce.number().positive(),
  durationValue: z.coerce.number().int().positive(),
  durationUnit: z.nativeEnum(DurationUnit),
  accessType: z.nativeEnum(AccessType),
  downloadLimitMbps: z.coerce.number().int().positive(),
  uploadLimitMbps: z.coerce.number().int().positive(),
});

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.COMPANY_ADMIN, Role.BIZANET_CEO]);

    const existing = await prisma.plan.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Forfait introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, existing.companyId);

    const body = await req.json();
    const parsed = planSchema.parse(body);

    const plan = await prisma.plan.update({
      where: { id: params.id },
      data: {
        name: parsed.name,
        price: parsed.price,
        durationValue: parsed.durationValue,
        durationUnit: parsed.durationUnit,
        accessType: parsed.accessType,
        downloadLimitMbps: parsed.downloadLimitMbps,
        uploadLimitMbps: parsed.uploadLimitMbps,
      },
      include: { company: { select: { currency: true } } },
    });

    const mikrotikSync = await syncPlanOnMikrotik(plan);

    await writeAuditLog({
      auth,
      companyId: plan.companyId,
      action: "PLAN_UPDATED",
      entityType: "Plan",
      message: `Plan updated: ${plan.name}`,
    });

    return NextResponse.json({ plan, mikrotikSync });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Un forfait avec ce nom existe déjà" },
        { status: 409 }
      );
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Impossible de mettre à jour le forfait" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.COMPANY_ADMIN, Role.BIZANET_CEO]);

    const existing = await prisma.plan.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Forfait introuvable" }, { status: 404 });
    }
    assertCompanyAccess(auth, existing.companyId);

    const [subscriptions, tokens, payments] = await Promise.all([
      prisma.internetSubscription.count({ where: { planId: params.id } }),
      prisma.accessToken.count({ where: { planId: params.id } }),
      prisma.payment.count({ where: { planId: params.id } }),
    ]);

    if (subscriptions > 0 || tokens > 0 || payments > 0) {
      return NextResponse.json(
        {
          error:
            "Ce forfait est utilisé (abonnements, tickets ou paiements). Suppression impossible.",
        },
        { status: 409 }
      );
    }

    const mikrotikSync = await deletePlanOnMikrotik(existing);

    await prisma.plan.delete({ where: { id: params.id } });

    await writeAuditLog({
      auth,
      companyId: existing.companyId,
      action: "PLAN_DELETED",
      entityType: "Plan",
      message: `Plan deleted: ${existing.name}`,
    });

    return NextResponse.json({ success: true, mikrotikSync });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Impossible de supprimer le forfait" },
      { status: 500 }
    );
  }
}
