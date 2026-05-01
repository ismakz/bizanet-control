import { prisma } from "@/lib/prisma";
import { getAuthContextFromHeaders } from "@/lib/auth";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const auth = await getAuthContextFromHeaders(headers());
  
  const where = auth.role === Role.BIZANET_CEO ? {} : { companyId: auth.companyId };
  
  const alerts = await prisma.alert.findMany({
    where,
    include: { company: true, router: true },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-orange-400" />
          Centre d'Alertes
        </h1>
        <p className="text-sm text-white/50 mt-1">Supervision et alertes système</p>
      </div>

      <div className="card overflow-hidden">
        {alerts.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white">Aucune alerte</h3>
            <p className="text-sm text-white/50 mt-1">Votre système est en bonne santé.</p>
          </div>
        ) : (
          <DataTable
            columns={[
              { accessorKey: "date", header: "Date" },
              { accessorKey: "severity", header: "Gravité" },
              { accessorKey: "title", header: "Alerte" },
              { accessorKey: "entity", header: "Entité concernée" },
              { accessorKey: "status", header: "Statut" }
            ]}
            data={alerts.map(a => ({
              id: a.id,
              date: <span className="text-sm text-white/70">{new Date(a.createdAt).toLocaleString()}</span>,
              severity: <span className={`px-2 py-1 text-xs rounded-full font-medium ${a.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : a.severity === 'WARNING' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{a.severity}</span>,
              title: (
                <div>
                  <div className="text-sm font-medium text-white">{a.title}</div>
                  <div className="text-xs text-white/50">{a.message}</div>
                </div>
              ),
              entity: (
                <div className="text-sm text-white/70">
                  {a.company?.name || "Global"}
                  {a.router && ` - ${a.router.name}`}
                </div>
              ),
              status: <StatusBadge status={a.status === "OPEN" ? "PENDING" : "SUCCESS"} />
            }))}
            keyExtractor={(a) => a.id}
          />
        )}
      </div>
    </div>
  );
}
