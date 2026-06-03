import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest } from "@/lib/auth";
import { requireOneOfRoles } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireOneOfRoles(auth, [Role.BIZANET_CEO]);

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const action = url.searchParams.get("action")?.trim() || "";
    const companyId = url.searchParams.get("companyId")?.trim() || "";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, Number(url.searchParams.get("pageSize")) || 25)
    );

    const where: Prisma.AuditLogWhereInput = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (action) {
      where.action = action;
    }

    if (q) {
      where.OR = [
        { message: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { actorUser: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { company: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const [total, logs, companies, actionRows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          message: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
          actorUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
              phone: true,
            },
          },
        },
      }),
      prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        orderBy: { action: "asc" },
      }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      filters: {
        companies,
        actions: actionRows.map((r) => r.action),
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    if (
      e instanceof Error &&
      (e.message === "FORBIDDEN_ROLE" || e.message.startsWith("FORBIDDEN"))
    ) {
      return NextResponse.json({ error: "Accès réservé au CEO BizaNet" }, { status: 403 });
    }
    console.error("[Audit Logs API]", e);
    return NextResponse.json(
      { error: "Impossible de charger les audit logs" },
      { status: 500 }
    );
  }
}
