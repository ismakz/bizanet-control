"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ClipboardList, CheckCircle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RegistrationRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/registration-requests");
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = (reqId: string) => {
    // Redirige vers le flux d'onboarding avec le reqId pour préremplir
    router.push(`/dashboard/companies/new?reqId=${reqId}`);
  };

  const handleReject = async (reqId: string) => {
    if (!confirm("Voulez-vous vraiment rejeter cette demande ?")) return;
    
    try {
      const res = await fetch(`/api/registration-requests/${reqId}/reject`, { method: "POST" });
      if (!res.ok) throw new Error("Erreur lors du rejet");
      fetchRequests();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const columns = [
    { 
      header: "Entreprise", 
      cell: (r: any) => (
        <div>
          <div className="font-medium text-white">{r.companyName}</div>
          <div className="text-xs text-white/50">{r.country}, {r.city}</div>
        </div>
      )
    },
    { 
      header: "Propriétaire", 
      cell: (r: any) => (
        <div>
          <div className="text-white/90">{r.ownerName}</div>
          <div className="text-xs text-white/50">{r.phone}</div>
        </div>
      )
    },
    { 
      header: "Clients est.", 
      accessorKey: "estimatedCustomers" as const 
    },
    { 
      header: "Date", 
      cell: (r: any) => new Date(r.createdAt).toLocaleDateString("fr-FR") 
    },
    { 
      header: "Statut", 
      cell: (r: any) => <StatusBadge status={r.status} /> 
    },
    { 
      header: "Actions", 
      cell: (r: any) => {
        if (r.status !== "PENDING") {
          return <span className="text-xs text-white/40">Traité par {r.reviewedByUser?.fullName || "Système"}</span>;
        }

        return (
          <div className="flex gap-2">
            <button 
              onClick={() => handleApprove(r.id)}
              className="flex items-center gap-1 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition text-xs font-medium"
            >
              <CheckCircle className="w-3 h-3" /> Approuver
            </button>
            <button 
              onClick={() => handleReject(r.id)}
              className="flex items-center gap-1 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition text-xs font-medium"
            >
              <XCircle className="w-3 h-3" /> Rejeter
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Demandes d'inscription</h1>
          <p className="text-sm text-white/50 mt-1">Gérez les demandes de création de comptes BizaNet.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <DataTable 
        data={requests} 
        columns={columns} 
        keyExtractor={(r) => r.id} 
        emptyMessage={loading ? "Chargement des demandes..." : "Aucune demande d'inscription"}
      />
    </div>
  );
}
