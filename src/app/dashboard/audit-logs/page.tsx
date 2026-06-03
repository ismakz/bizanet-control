import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import AuditLogsClient from "./AuditLogsClient";

export default async function AuditLogsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.BIZANET_CEO) {
    redirect("/dashboard");
  }

  return (
    <div className="p-6">
      <AuditLogsClient />
    </div>
  );
}
