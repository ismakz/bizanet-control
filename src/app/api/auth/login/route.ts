import { NextResponse } from "next/server";
import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth";

const loginSchema = z.object({
  phone: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.parse(body);
    const { token, user } = await login(parsed.phone, parsed.password);
    setSessionCookie(token);

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
