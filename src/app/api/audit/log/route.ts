import { NextResponse } from "next/server";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";

const auditLogSchema = z.object({
  action: z.enum(["TOKEN_EXPORTED", "TOKEN_PRINTED"]),
  entityType: z.string(),
  message: z.string(),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.COMPANY_ADMIN, Role.COMPANY_AGENT]);

    if (!auth.companyId) {
      return NextResponse.json({ error: "CompanyId manquant" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = auditLogSchema.parse(body);

    await writeAuditLog({
      auth,
      companyId: auth.companyId,
      action: parsed.action,
      entityType: parsed.entityType,
      message: parsed.message,
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map(i => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
