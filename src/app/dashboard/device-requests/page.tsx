import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Smartphone, CheckCircle, XCircle, Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeviceRequestActions } from "./DeviceRequestActions";

export const dynamic = "force-dynamic";

export default async function DeviceRequestsPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.COMPANY_ADMIN && user.role !== Role.BIZANET_CEO)) {
    redirect("/dashboard");
  }

  const tenantWhere = getTenantWhere({ userId: user.id, role: user.role, companyId: user.companyId });

  const requests = await prisma.deviceChangeRequest.findMany({
    where: tenantWhere,
    orderBy: { requestedAt: "desc" },
    include: {
      accessToken: true,
      customer: true
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-cyan" />
            Demandes de changement d'appareil
          </h1>
          <p className="text-sm text-white/50 mt-1">Gérez les demandes de vos clients pour lier leur code d'accès à un nouveau téléphone/ordinateur.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white/5 text-white/60 border-b border-white/10 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium tracking-wider">Date</th>
                <th className="px-6 py-4 font-medium tracking-wider">Abonné</th>
                <th className="px-6 py-4 font-medium tracking-wider">Code d'accès</th>
                <th className="px-6 py-4 font-medium tracking-wider">Ancien ID</th>
                <th className="px-6 py-4 font-medium tracking-wider">Nouvel ID</th>
                <th className="px-6 py-4 font-medium tracking-wider">Statut</th>
                <th className="px-6 py-4 font-medium tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/40">
                    <Smartphone className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    Aucune demande de changement d'appareil.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/5 transition">
                    <td className="px-6 py-4 font-medium text-white/90">
                      {req.requestedAt.toLocaleDateString()} {req.requestedAt.toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-cyan">
                      {req.customer?.fullName || "Inconnu"}
                    </td>
                    <td className="px-6 py-4 font-mono tracking-wider">
                      {req.accessToken.token}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-white/40 max-w-[120px] truncate" title={req.oldDeviceId || ""}>
                      {req.oldDeviceId || "Aucun"}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-white/40 max-w-[120px] truncate" title={req.newDeviceId}>
                      {req.newDeviceId}
                    </td>
                    <td className="px-6 py-4">
                      {req.status === "PENDING" && <span className="inline-flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full text-xs"><Clock className="w-3 h-3" /> En attente</span>}
                      {req.status === "APPROVED" && <span className="inline-flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded-full text-xs"><CheckCircle className="w-3 h-3" /> Approuvé</span>}
                      {req.status === "REJECTED" && <span className="inline-flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-xs"><XCircle className="w-3 h-3" /> Refusé</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {req.status === "PENDING" && (
                        <DeviceRequestActions requestId={req.id} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
