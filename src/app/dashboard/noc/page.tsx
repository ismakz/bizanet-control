import { prisma } from "@/lib/prisma";
import { getAuthContextFromHeaders, requireRole } from "@/lib/auth";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { calculateCompanyHealthScore } from "@/lib/health-score";
import { ShieldAlert, Server, Activity, Building2, ServerCrash, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";

export const dynamic = 'force-dynamic';

export default async function NOCDashboard() {
  const auth = await getAuthContextFromHeaders(headers());
  if (auth.role !== Role.BIZANET_CEO) {
    redirect("/dashboard");
  }

  // Fetch KPIs
  const totalCompanies = await prisma.company.count();
  const routers = await prisma.router.findMany({ include: { company: true } });
  const routersOnline = routers.filter(r => r.status === "ONLINE").length;
  const routersOffline = routers.filter(r => r.status === "OFFLINE").length;
  const criticalAlerts = await prisma.alert.count({
    where: { severity: "CRITICAL", status: "OPEN" }
  });

  // Fetch Companies & calculate health score
  const companiesData = await prisma.company.findMany({
    include: {
      routers: true,
      customers: { where: { status: "ACTIVE" } }
    }
  });

  const companiesWithHealth = await Promise.all(
    companiesData.map(async (c) => {
      const health = await calculateCompanyHealthScore(c.id);
      return {
        ...c,
        healthScore: health.score,
        healthLabel: health.label,
        activeCustomersCount: c.customers.length,
        hasOpenAlerts: await prisma.alert.count({ where: { companyId: c.id, status: "OPEN" } }) > 0
      };
    })
  );

  // Fetch Open Alerts
  const alerts = await prisma.alert.findMany({
    where: { status: "OPEN" },
    include: { company: true, router: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="h-6 w-6 text-cyan" />
          Network Operations Center
        </h1>
        <p className="text-sm text-white/50 mt-1">Vue globale de l'infrastructure BizaNet SaaS</p>
      </div>

      {/* 1. KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
              <Building2 className="h-5 w-5 text-white/70" />
            </div>
            <div>
              <p className="text-sm text-white/50">Entreprises SaaS</p>
              <p className="text-2xl font-bold text-white">{totalCompanies}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <Server className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Routeurs Online</p>
              <p className="text-2xl font-bold text-emerald-400">{routersOnline}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <ServerCrash className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Routeurs Offline</p>
              <p className="text-2xl font-bold text-red-400">{routersOffline}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 border-orange-500/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              <ShieldAlert className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-white/50">Alertes Critiques</p>
              <p className="text-2xl font-bold text-orange-400">{criticalAlerts}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 2. Liste Companies (Left Column) */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-medium text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-white/50" />
            État des Entreprises
          </h2>
          <div className="card overflow-hidden">
            <DataTable
              columns={[
                { accessorKey: "name", header: "Entreprise" },
                { accessorKey: "health", header: "Health Score" },
                { accessorKey: "clients", header: "Clients Actifs" },
                { accessorKey: "routers", header: "Routeurs" },
                { accessorKey: "alerts", header: "Alertes" },
                { accessorKey: "actions", header: "" }
              ]}
              data={companiesWithHealth.map(c => ({
                id: c.id,
                name: <span className="font-medium text-white">{c.name}</span>,
                health: (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${c.healthScore >= 90 ? 'bg-emerald-400' : c.healthScore >= 70 ? 'bg-cyan' : c.healthScore >= 50 ? 'bg-orange-400' : 'bg-red-500'}`} 
                        style={{ width: `${c.healthScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/70">{c.healthScore}</span>
                  </div>
                ),
                clients: <span className="text-sm text-white/70">{c.activeCustomersCount}</span>,
                routers: (
                  <div className="flex gap-1">
                    {c.routers.map(r => (
                      <div key={r.id} className={`w-2 h-2 rounded-full ${r.status === 'ONLINE' ? 'bg-emerald-400' : 'bg-red-500'}`} title={r.name} />
                    ))}
                    {c.routers.length === 0 && <span className="text-xs text-white/30">Aucun</span>}
                  </div>
                ),
                alerts: c.hasOpenAlerts ? <StatusBadge status="WARNING" /> : <StatusBadge status="SUCCESS" />,
                actions: (
                  <Link href={`/dashboard/companies/${c.id}`} className="text-cyan text-sm hover:underline">
                    Détails
                  </Link>
                )
              }))}
              keyExtractor={(c) => c.id}
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          
          {/* 3. Liste Alerts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-white/50" />
                Alertes Ouvertes
              </h2>
              <Link href="/dashboard/alerts" className="text-sm text-cyan hover:underline">Voir tout</Link>
            </div>
            
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="card p-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500/50 mx-auto mb-2" />
                  <p className="text-sm text-white/50">Aucune alerte ouverte</p>
                </div>
              ) : alerts.map(alert => (
                <div key={alert.id} className={`card p-4 border-l-4 ${alert.severity === 'CRITICAL' ? 'border-red-500 bg-red-500/5' : alert.severity === 'WARNING' ? 'border-orange-500 bg-orange-500/5' : 'border-cyan bg-cyan/5'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-sm font-medium text-white">{alert.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-white/50">{alert.severity}</span>
                  </div>
                  <p className="text-xs text-white/70 line-clamp-2">{alert.message}</p>
                  {alert.company && (
                    <div className="mt-2 text-xs text-white/40">{alert.company.name}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Liste Routeurs (simplifiée) */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-white/50" />
              État des Routeurs
            </h2>
            <div className="card overflow-hidden">
              <DataTable
                columns={[
                  { accessorKey: "name", header: "Routeur" },
                  { accessorKey: "status", header: "État" }
                ]}
                data={routers.map(r => ({
                  id: r.id,
                  name: (
                    <div>
                      <div className="text-sm font-medium text-white">{r.name}</div>
                      <div className="text-[10px] text-white/50">{r.company.name}</div>
                    </div>
                  ),
                  status: (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status === "ONLINE" ? "SUCCESS" : "FAILED"} />
                    </div>
                  )
                }))}
                keyExtractor={(r) => r.id}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
