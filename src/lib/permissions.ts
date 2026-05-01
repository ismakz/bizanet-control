import { Role } from "@prisma/client";

export type AuthContext = {
  userId: string;
  role: Role;
  companyId: string | null;
};

export function canAccessCompany(auth: AuthContext, companyId: string): boolean {
  if (auth.role === Role.BIZANET_CEO || auth.role === Role.BIZANET_SUPPORT) return true;
  return !!auth.companyId && auth.companyId === companyId;
}

export function assertCompanyAccess(auth: AuthContext, companyId: string): void {
  if (!canAccessCompany(auth, companyId)) {
    throw new Error("FORBIDDEN_COMPANY_SCOPE");
  }
}

export function requireOneOfRoles(auth: AuthContext, roles: Role[]): void {
  if (!roles.includes(auth.role)) {
    throw new Error("FORBIDDEN_ROLE");
  }
}

export function getTenantWhere(auth: AuthContext): { companyId?: string } {
  if (auth.role === Role.BIZANET_CEO || auth.role === Role.BIZANET_SUPPORT) {
    return {};
  }
  if (!auth.companyId) {
    throw new Error("MISSING_COMPANY");
  }
  return { companyId: auth.companyId };
}

export function resolveWriteCompanyId(auth: AuthContext, requestedCompanyId?: string | null): string {
  if (auth.role === Role.BIZANET_CEO || auth.role === Role.BIZANET_SUPPORT) {
    if (requestedCompanyId) return requestedCompanyId;
    if (auth.companyId) return auth.companyId;
    throw new Error("COMPANY_ID_REQUIRED");
  }
  if (!auth.companyId) {
    throw new Error("MISSING_COMPANY");
  }
  if (requestedCompanyId && requestedCompanyId !== auth.companyId) {
    throw new Error("FORBIDDEN_COMPANY_SCOPE");
  }
  return auth.companyId;
}
