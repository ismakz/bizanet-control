import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CompanyStatus, Role, RouterStatus } from "@prisma/client";
import { getAuthContextFromRequest, requireRole } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { CURRENCIES } from "@/config/currencies";

const onboardSchema = z.object({
  companyName: z.string().min(1).max(120),
  ownerName: z.string().min(1).max(120),
  ownerPhone: z.string().min(3).max(40),
  country: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  address: z.string().optional(),
  saasPlan: z.string().optional(),
  saasExpiresAt: z.string().optional(),
  adminFullName: z.string().min(1).max(120),
  adminEmail: z.string().email().optional().or(z.literal("")),
  adminPhone: z.string().min(3).max(40),
  adminPassword: z.string().min(6).max(200),
  routerName: z.string().min(1).optional(),
  routerHost: z.string().min(1).optional(),
  routerUsername: z.string().min(1).optional(),
  routerPassword: z.string().min(1).optional(),
  reqId: z.string().optional(),
  mustChangePassword: z.boolean().default(true),
  currency: z.string().default("USD").refine(val => CURRENCIES.some(c => c.code === val), {
    message: "Devise non supportée"
  }),
});

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString().slice(-4);
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    requireRole(auth, [Role.BIZANET_CEO]);

    const body = await req.json();
    const parsed = onboardSchema.parse(body);

    let existingUser = null;
    if (parsed.adminEmail) {
      existingUser = await prisma.user.findUnique({ where: { email: parsed.adminEmail } });
      if (existingUser) {
        return NextResponse.json({ error: "L'email admin est déjà utilisé" }, { status: 400 });
      }
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: parsed.adminPhone } });
    if (existingPhone) {
      return NextResponse.json({ error: "Ce numéro est déjà utilisé" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.adminPassword, 10);
    const slug = toSlug(parsed.companyName);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: parsed.companyName,
          ownerName: parsed.ownerName,
          ownerPhone: parsed.ownerPhone,
          country: parsed.country,
          city: parsed.city,
          address: parsed.address,
          saasPlan: parsed.saasPlan,
          saasExpiresAt: parsed.saasExpiresAt ? new Date(parsed.saasExpiresAt) : null,
          status: CompanyStatus.ACTIVE,
          currency: parsed.currency,
          slug,
        },
      });

      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          fullName: parsed.adminFullName,
          email: parsed.adminEmail || null,
          phone: parsed.adminPhone,
          role: Role.COMPANY_ADMIN,
          passwordHash,
          mustChangePassword: parsed.mustChangePassword,
        },
      });

      let router = null;
      if (parsed.routerName && parsed.routerHost && parsed.routerUsername && parsed.routerPassword) {
        router = await tx.router.create({
          data: {
            companyId: company.id,
            name: parsed.routerName,
            host: parsed.routerHost,
            username: parsed.routerUsername,
            encryptedPassword: encrypt(parsed.routerPassword),
            status: RouterStatus.OFFLINE,
          }
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorUserId: auth.userId,
          action: "COMPANY_ONBOARDED",
          entityType: "Company",
          message: `Company ${company.name} onboarded with admin ${admin.email || parsed.adminPhone} ${router ? 'and router' : ''}`,
        }
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorUserId: auth.userId,
          action: "ADMIN_CREATED",
          entityType: "User",
          message: `Admin account created for ${admin.fullName} (${admin.phone})`,
        }
      });

      if (parsed.reqId) {
        await tx.companyRegistrationRequest.update({
          where: { id: parsed.reqId },
          data: {
            status: "APPROVED",
            reviewedByUserId: auth.userId,
            reviewedAt: new Date()
          }
        });

        await tx.auditLog.create({
          data: {
            companyId: company.id,
            actorUserId: auth.userId,
            action: "APPROVE_REGISTRATION_REQUEST",
            entityType: "CompanyRegistrationRequest",
            message: `Approved registration request for company ${company.name} and completed onboarding`,
          }
        });
      }

      return { company, admin, router };
    });

    const { admin, ...rest } = result;
    const { passwordHash: _, ...safeAdmin } = admin;

    return NextResponse.json({ ...rest, admin: safeAdmin }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error && (e.message === "UNAUTHENTICATED" || e.message.startsWith("FORBIDDEN"))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Impossible de finaliser l'onboarding" }, { status: 500 });
  }
}
