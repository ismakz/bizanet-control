import { NextResponse } from "next/server";
import { z } from "zod";
import { CompanyStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const companySchema = z.object({
  name: z.string().min(1).max(120),
  ownerName: z.string().min(1).max(120),
  ownerPhone: z.string().min(3).max(40),
  country: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  status: z.nativeEnum(CompanyStatus).optional(),
  slug: z.string().min(2).max(80).optional(),
});

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO]);

    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ companies });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les companies" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO]);

    const body = await req.json();
    const parsed = companySchema.parse(body);
    const company = await prisma.company.create({
      data: {
        name: parsed.name,
        ownerName: parsed.ownerName,
        ownerPhone: parsed.ownerPhone,
        country: parsed.country,
        city: parsed.city,
        status: parsed.status ?? CompanyStatus.ACTIVE,
        slug: parsed.slug ?? toSlug(parsed.name),
      },
    });

    await writeAuditLog({
      auth,
      companyId: company.id,
      action: "COMPANY_CREATED",
      entityType: "Company",
      message: `Company created: ${company.name}`,
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "UNAUTHENTICATED" || e.message.startsWith("FORBIDDEN"))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de créer la company" }, { status: 500 });
  }
}
