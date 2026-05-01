import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Building2, Plus } from "lucide-react";

export default async function CompaniesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.BIZANET_CEO) {
    redirect("/dashboard");
  }

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { customers: true, routers: true }
      }
    }
  });

  const columns = [
    { header: "Nom", accessorKey: "name" as const },
    { header: "Propriétaire", accessorKey: "ownerName" as const },
    { 
      header: "Localisation", 
      cell: (item: any) => `${item.city}, ${item.country}` 
    },
    { 
      header: "SaaS Plan", 
      cell: (item: any) => item.saasPlan || "-" 
    },
    { 
      header: "Expiration", 
      cell: (item: any) => item.saasExpiresAt ? new Date(item.saasExpiresAt).toLocaleDateString() : "-" 
    },
    { 
      header: "Clients", 
      cell: (item: any) => item._count.customers 
    },
    { 
      header: "Routeurs", 
      cell: (item: any) => item._count.routers 
    },
    { 
      header: "Statut", 
      cell: (item: any) => <StatusBadge status={item.status} /> 
    },
    { 
      header: "Actions", 
      cell: (item: any) => (
        <Link href={`/dashboard/companies/${item.id}`} className="text-cyan hover:text-cyan/80 transition text-sm font-medium">
          Voir détails
        </Link>
      ) 
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Companies (Franchises)</h1>
            <p className="text-sm text-white/50 mt-1">Gérez vos entreprises clientes</p>
          </div>
        </div>
        <Link href="/dashboard/companies/new" className="flex items-center gap-2 rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)]">
          <Plus className="w-4 h-4" />
          Créer entreprise + admin
        </Link>
      </div>

      <DataTable 
        data={companies} 
        columns={columns} 
        keyExtractor={(c) => c.id} 
        emptyMessage="Aucune entreprise enregistrée"
      />
    </div>
  );
}
