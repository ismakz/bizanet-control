"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeviceRequestActions({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAction = async (action: "approve" | "reject") => {
    if (!confirm(`Voulez-vous vraiment ${action === "approve" ? "APPROUVER" : "REJETER"} cette demande ?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/device-requests/${requestId}/${action}`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Erreur lors du traitement");
      router.refresh();
    } catch (e) {
      alert("Erreur réseau ou serveur.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader2 className="w-5 h-5 text-white/50 animate-spin mx-auto" />;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button 
        onClick={() => handleAction("reject")}
        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition"
        title="Refuser"
      >
        <XCircle className="w-5 h-5" />
      </button>
      <button 
        onClick={() => handleAction("approve")}
        className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg transition"
        title="Approuver"
      >
        <CheckCircle className="w-5 h-5" />
      </button>
    </div>
  );
}
