import { prisma } from "@/lib/prisma";
import { AuthContext } from "@/lib/permissions";

type AuditInput = {
  auth?: AuthContext | null;
  actorUserId?: string | null;
  companyId?: string | null;
  action: string;
  entityType: string;
  message: string;
  severity?: string;
  ipAddress?: string;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      actorUserId: input.actorUserId ?? input.auth?.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      message: input.message,
      severity: input.severity || "INFO",
      ipAddress: input.ipAddress || null,
    },
  });
}
