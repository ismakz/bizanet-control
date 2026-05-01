import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN, Role.BIZANET_SUPPORT]);

    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    if (!q || q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const whereBase: any = auth.role === Role.BIZANET_CEO || auth.role === Role.BIZANET_SUPPORT ? {} : { companyId: auth.companyId! };

    // Recherche de Tokens
    const tokens = await prisma.accessToken.findMany({
      where: {
        ...whereBase,
        token: { contains: q, mode: "insensitive" }
      },
      include: {
        plan: true,
        devices: true,
        company: true
      },
      take: 5
    });

    // Recherche de Customers
    const customers = await prisma.customer.findMany({
      where: {
        ...whereBase,
        OR: [
          { phone: { contains: q } },
          { fullName: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } }
        ]
      },
      include: {
        subscriptions: true,
        company: true
      },
      take: 5
    });

    const results = [
      ...tokens.map(t => ({
        type: "TOKEN",
        id: t.id,
        title: t.token,
        subtitle: `Plan: ${t.plan.name} - Statut: ${t.status} - Risque: ${t.riskLevel}`,
        details: t
      })),
      ...customers.map(c => ({
        type: "CUSTOMER",
        id: c.id,
        title: c.fullName || c.username,
        subtitle: `Tel: ${c.phone || "N/A"} - Statut: ${c.status}`,
        details: c
      }))
    ];

    return NextResponse.json({ results });
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
