import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContextFromRequest, signToken, setSessionCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    const body = await req.json();
    const parsed = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId }
    });

    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const isValid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
    if (!isValid) return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });

    const newHash = await bcrypt.hash(parsed.newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      }
    });

    await writeAuditLog({
      auth,
      companyId: user.companyId,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      message: "L'utilisateur a changé son mot de passe",
    });

    const token = signToken({
      sub: updatedUser.id,
      role: updatedUser.role,
      companyId: updatedUser.companyId,
      mustChangePassword: false,
    });

    setSessionCookie(token);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    if (e.message === "UNAUTHENTICATED") return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
