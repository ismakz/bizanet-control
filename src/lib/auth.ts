import { Role, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthContext } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "bizanet_session";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

type SessionPayload = {
  sub: string;
  role: Role;
  companyId: string | null;
  mustChangePassword?: boolean;
};

type AuthUser = Pick<User, "id" | "fullName" | "phone" | "email" | "role" | "companyId" | "mustChangePassword" | "profileImageUrl">;

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
}

function toAuthContext(user: AuthUser): AuthContext {
  return {
    userId: user.id,
    role: user.role,
    companyId: user.companyId,
  };
}

export function signToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: `${AUTH_COOKIE_MAX_AGE}s`,
  });
}

function decodeToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

async function getUserById(userId: string): Promise<AuthUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      role: true,
      companyId: true,
      mustChangePassword: true,
      profileImageUrl: true,
    },
  });
}

async function getTokenFromRequest(req: Request): Promise<string | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!raw) return null;
  return decodeURIComponent(raw.split("=")[1] ?? "");
}

export function setSessionCookie(token: string): void {
  cookies().set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function login(phone: string, password: string): Promise<{ token: string; user: AuthUser }> {
  console.log("Login attempt received for phone:", phone);

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      role: true,
      companyId: true,
      passwordHash: true,
      mustChangePassword: true,
      profileImageUrl: true,
    },
  });
  
  if (!user) {
    console.log("Login failed: User not found for phone:", phone);
    throw new Error("USER_NOT_FOUND");
  }

  console.log("Login: User found:", user.id, user.role);

  const isValid = await bcrypt.compare(password, user.passwordHash);
  console.log("Login: bcrypt.compare result:", isValid);
  
  if (!isValid) {
    throw new Error("INCORRECT_PASSWORD");
  }

  const safeUser: AuthUser = {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    mustChangePassword: user.mustChangePassword,
    profileImageUrl: user.profileImageUrl,
  };
  const token = signToken({
    sub: safeUser.id,
    role: safeUser.role,
    companyId: safeUser.companyId,
    mustChangePassword: safeUser.mustChangePassword,
  });

  return { token, user: safeUser };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload?.sub) return null;
  return getUserById(payload.sub);
}

export async function getCurrentUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = await getTokenFromRequest(req);
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload?.sub) return null;
  return getUserById(payload.sub);
}

export async function requireAuth(req?: Request): Promise<AuthContext> {
  const user = req ? await getCurrentUserFromRequest(req) : await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return toAuthContext(user);
}

export function requireRole(auth: AuthContext, roles: Role[]): void {
  if (!roles.includes(auth.role)) {
    throw new Error("FORBIDDEN_ROLE");
  }
}

export async function getAuthContextFromHeaders(_headers: Headers): Promise<AuthContext> {
  return requireAuth();
}

export async function getAuthContextFromRequest(req: Request): Promise<AuthContext> {
  return requireAuth(req);
}

export function canWriteTenantData(auth: AuthContext): boolean {
  return (
    auth.role === Role.BIZANET_CEO ||
    auth.role === Role.COMPANY_ADMIN ||
    auth.role === Role.COMPANY_AGENT
  );
}
