import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const where = auth.role === Role.BIZANET_CEO ? {} : getTenantWhere(auth);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        action: true,
        entityType: true,
        message: true,
        createdAt: true,
        actorUser: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    return NextResponse.json({ error: "Impossible de charger les audit logs" }, { status: 500 });
  }
}
