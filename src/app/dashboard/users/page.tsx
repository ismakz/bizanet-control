"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Users } from "lucide-react";

type UserItem = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  companyId: string | null;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/users");
      if (!res.ok) {
        setError("Impossible de charger les utilisateurs");
        return;
      }
      const data = (await res.json()) as { users: UserItem[] };
      setUsers(data.users);
    })();
  }, []);

  const columns = [
    { header: "Nom", accessorKey: "fullName" as const },
    { header: "Téléphone", accessorKey: "phone" as const },
    { header: "Email", cell: (u: UserItem) => u.email || "-" },
    { header: "Rôle", accessorKey: "role" as const },
    { header: "Company", cell: (u: UserItem) => u.companyId || "BizaNet Control" }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Utilisateurs</h1>
          <p className="text-sm text-white/50 mt-1">Gérez les accès à la plateforme</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <DataTable 
        data={users} 
        columns={columns} 
        keyExtractor={(u) => u.id} 
        emptyMessage="Aucun utilisateur trouvé"
      />
    </div>
  );
}
