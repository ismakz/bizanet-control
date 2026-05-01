import { NextResponse } from "next/server";
import { z } from "zod";
import { CompanyStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  ownerName: z.string().min(1).max(120).optional(),
  ownerPhone: z.string().min(3).max(40).optional(),
  country: z.string().min(1).max(80).optional(),
  city: z.string().min(1).max(80).optional(),
  status: z.nativeEnum(CompanyStatus).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO]);

    const body = await req.json();
    const parsed = patchSchema.parse(body);

    const company = await prisma.company.update({
      where: { id: params.id },
      data: parsed,
    });

    await writeAuditLog({
      auth,
      companyId: company.id,
      action: "COMPANY_UPDATED",
      entityType: "Company",
      message: `Company updated: ${company.name}`,
    });

    return NextResponse.json({ company });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "UNAUTHENTICATED" || e.message.startsWith("FORBIDDEN"))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de modifier la company" }, { status: 500 });
  }
}
