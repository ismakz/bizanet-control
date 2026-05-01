import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";

function arrayToCsv(data: any[]) {
  if (data.length === 0) return "";
  const keys = Object.keys(data[0]);
  const header = keys.join(",");
  const rows = data.map(row => {
    return keys.map(k => {
      let val = row[k] === null || row[k] === undefined ? "" : row[k];
      if (typeof val === "string") {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(",");
  });
  return [header, ...rows].join("\n");
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO, Role.COMPANY_ADMIN]);

    const url = new URL(req.url);
    const entity = url.searchParams.get("entity");

    const where: any = auth.role === Role.BIZANET_CEO ? {} : { companyId: auth.companyId! };

    let data: any[] = [];

    if (entity === "tokens") {
      const tokens = await prisma.accessToken.findMany({ where, include: { plan: true } });
      data = tokens.map(t => ({
        ID: t.id,
        Token: t.token,
        Plan: t.plan.name,
        Status: t.status,
        RiskLevel: t.riskLevel,
        AccessType: t.accessType,
        Price: t.price,
        CreatedAt: t.createdAt.toISOString()
      }));
    } else if (entity === "customers") {
      const customers = await prisma.customer.findMany({ where });
      data = customers.map(c => ({
        ID: c.id,
        Name: c.fullName,
        Username: c.username,
        Phone: c.phone,
        Status: c.status,
        AccessType: c.accessType,
        ExpiresAt: c.expiresAt?.toISOString() || ""
      }));
    } else if (entity === "payments") {
      const payments = await prisma.payment.findMany({ where });
      data = payments.map(p => ({
        ID: p.id,
        Amount: p.amount,
        Method: p.method,
        Status: p.status,
        CreatedAt: p.createdAt.toISOString()
      }));
    } else if (entity === "auditlogs") {
      const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });
      data = logs.map(l => ({
        ID: l.id,
        Action: l.action,
        Entity: l.entityType,
        Severity: l.severity,
        Message: l.message,
        Date: l.createdAt.toISOString()
      }));
    } else {
      return NextResponse.json({ error: "Entité non supportée" }, { status: 400 });
    }

    const csvStr = arrayToCsv(data);
    const response = new NextResponse(csvStr);
    response.headers.set("Content-Type", "text/csv");
    response.headers.set("Content-Disposition", `attachment; filename=export_${entity}_${new Date().toISOString().split("T")[0]}.csv`);
    return response;

  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (e.message.startsWith("FORBIDDEN")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
