import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CURRENCIES } from "@/config/currencies";

export default async function CompanyDetailsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.BIZANET_CEO) {
    redirect("/dashboard");
  }

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      users: { where: { role: Role.COMPANY_ADMIN } },
      routers: true,
      _count: { select: { customers: true, plans: true, payments: true } }
    }
  });

  if (!company) {
    return <div className="text-white">Company not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/dashboard/companies" className="text-sm text-cyan hover:underline">&larr; Retour aux compagnies</Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{company.name}</h1>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${company.status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          {company.status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Company Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-white/10 pb-2">Informations Générales</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Propriétaire</span><span className="text-white/90">{company.ownerName}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Téléphone</span><span className="text-white/90">{company.ownerPhone}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Localisation</span><span className="text-white/90">{company.city}, {company.country}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Devise Principale</span><span className="text-white/90">{company.currency} - {CURRENCIES.find(c => c.code === company.currency)?.label || ""}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Adresse</span><span className="text-white/90">{company.address || "-"}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Plan SaaS</span><span className="text-white/90">{company.saasPlan || "-"}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Expiration SaaS</span><span className="text-white/90">{company.saasExpiresAt ? new Date(company.saasExpiresAt).toLocaleDateString() : "-"}</span></div>
          </div>
        </div>

        {/* Admins */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-white/10 pb-2">Administrateurs</h2>
          {company.users.length > 0 ? (
            <div className="space-y-4">
              {company.users.map(u => (
                <div key={u.id} className="space-y-1 text-sm bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="text-cyan text-xs font-semibold mb-1">Admin Principal (COMPANY_ADMIN)</div>
                  <div className="font-medium text-white">{u.fullName}</div>
                  <div className="text-white/60">{u.phone}</div>
                  {u.email && <div className="text-white/60">{u.email}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">Aucun administrateur trouvé.</p>
          )}
        </div>

        {/* Routers */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-white/10 pb-2">Routeurs MikroTik</h2>
          {company.routers.length > 0 ? (
            <div className="space-y-4">
              {company.routers.map(r => (
                <div key={r.id} className="space-y-1 text-sm bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{r.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${r.status === 'ONLINE' ? 'bg-green-500/20 text-green-300' : r.status === 'OFFLINE' ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-300'}`}>{r.status}</span>
                  </div>
                  <div className="text-white/60">{r.host}</div>
                  <div className="text-white/60">User: {r.username}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">Aucun routeur configuré.</p>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-white/50 uppercase">Clients Finaux</div>
          <div className="mt-1 text-2xl font-medium text-white">{company._count.customers}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-white/50 uppercase">Forfaits</div>
          <div className="mt-1 text-2xl font-medium text-white">{company._count.plans}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-white/50 uppercase">Paiements Enregistrés</div>
          <div className="mt-1 text-2xl font-medium text-white">{company._count.payments}</div>
        </div>
      </div>

    </div>
  );
}
