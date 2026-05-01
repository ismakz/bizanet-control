import { NextResponse } from "next/server";
import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const loginSchema = z.object({
  phone: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.parse(body);
    const ipAddress = req.headers.get("x-forwarded-for")?.split(',')[0] || req.headers.get("x-real-ip") || "127.0.0.1";

    // Rate Limiting Check
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFailures = await prisma.loginAttempt.count({
      where: {
        phone: parsed.phone,
        success: false,
        createdAt: { gte: fifteenMinsAgo }
      }
    });

    if (recentFailures >= 5) {
      await writeAuditLog({
        action: "BRUTE_FORCE_BLOCKED",
        entityType: "System",
        message: `Compte ${parsed.phone} bloqué temporairement suite à de multiples échecs depuis l'IP ${ipAddress}.`,
        ipAddress,
        severity: "WARNING"
      });
      return NextResponse.json({ error: "Trop de tentatives échouées. Veuillez réessayer dans 15 minutes." }, { status: 429 });
    }

    try {
      const { token, user } = await login(parsed.phone, parsed.password);
      setSessionCookie(token);

      // Log success
      await prisma.loginAttempt.create({
        data: {
          ipAddress,
          phone: parsed.phone,
          success: true
        }
      });

      return NextResponse.json({
        user: {
          id: user.id,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
        },
      });
    } catch (authError: any) {
      // Log failure
      await prisma.loginAttempt.create({
        data: {
          ipAddress,
          phone: parsed.phone,
          success: false
        }
      });
      throw authError; // Rethrow to be caught by outer block
    }

  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    if (e instanceof Error) {
      if (e.message === "USER_NOT_FOUND") {
        return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 401 });
      }
      if (e.message === "INCORRECT_PASSWORD") {
        return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
      }
    }
    return NextResponse.json({ error: "Impossible de se connecter" }, { status: 500 });
  }
}
