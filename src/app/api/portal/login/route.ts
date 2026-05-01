import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sign } from "jsonwebtoken";

import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { phone, password } = await req.json();

    const customer = await prisma.customer.findFirst({
      where: { phone }
    });

    if (!customer) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, customer.password);
    if (!isValid) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
    const token = sign({ sub: customer.id, role: "END_CUSTOMER", companyId: customer.companyId }, secret, { expiresIn: '7d' });

    const res = NextResponse.json({ success: true });
    res.cookies.set("customer_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
