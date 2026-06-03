"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { FileText, Search, ChevronLeft, ChevronRight } from "lucide-react";

type AuditLogItem = {
  id: string;
  action: string;
  entityType: string;
  message: string;
  createdAt: string;
  company: { id: string; name: string } | null;
  actorUser: {
    id: string;
    fullName: string;
    role: string;
    phone: string;
  } | null;
};

type CompanyOption = { id: string; name: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pagination.pageSize),
        });
        if (search.trim()) params.set("q", search.trim());
        if (actionFilter) params.set("action", actionFilter);
        if (companyFilter) params.set("companyId", companyFilter);

        const res = await fetch(`/api/audit-logs?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Impossible de charger les audit logs");
        }

        setLogs(data.logs || []);
        setPagination(data.pagination || pagination);
        if (data.filters?.companies) setCompanies(data.filters.companies);
        if (data.filters?.actions) setActions(data.filters.actions);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur de chargement");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [search, actionFilter, companyFilter, pagination.pageSize]
  );

  useEffect(() => {
    fetchLogs(1);
  }, [actionFilter, companyFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const columns = [
    {
      header: "Date",
      cell: (log: AuditLogItem) =>
        new Date(log.createdAt).toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
    },
    {
      header: "Utilisateur",
      cell: (log: AuditLogItem) => (
        <div>
          <div className="text-white/90">{log.actorUser?.fullName || "—"}</div>
          {log.actorUser?.phone ? (
            <div className="text-xs text-white/40">{log.actorUser.phone}</div>
          ) : null}
        </div>
      ),
    },
    {
      header: "Rôle",
      cell: (log: AuditLogItem) => (
        <span className="text-xs font-mono text-cyan/90">
          {log.actorUser?.role || "—"}
        </span>
      ),
    },
    {
      header: "Action",
      cell: (log: AuditLogItem) => (
        <span className="text-xs font-medium text-white/80">{log.action}</span>
      ),
    },
    {
      header: "Description",
      cell: (log: AuditLogItem) => (
        <span className="text-white/70 max-w-md truncate block" title={log.message}>
          {log.message}
        </span>
      ),
    },
    {
      header: "Entreprise",
      cell: (log: AuditLogItem) => log.company?.name || "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Audit Logs
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Historique des actions critiques sur la plateforme
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-white/50">Recherche</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Description, action, utilisateur, entreprise…"
                className="w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-cyan focus:outline-none"
              />
            </div>
          </label>

          <label className="w-full lg:w-48 space-y-1">
            <span className="text-xs text-white/50">Action</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white focus:border-cyan focus:outline-none"
            >
              <option value="">Toutes les actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="w-full lg:w-56 space-y-1">
            <span className="text-xs text-white/50">Entreprise</span>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white focus:border-cyan focus:outline-none"
            >
              <option value="">Toutes les entreprises</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cyan px-5 py-2.5 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 disabled:opacity-50"
          >
            Rechercher
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-white/50 py-8 text-center">Chargement…</div>
      ) : (
        <>
          <DataTable
            data={logs}
            columns={columns}
            keyExtractor={(log) => log.id}
            emptyMessage="Aucun log d'audit trouvé"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-xs text-white/50">
              {pagination.total} entrée{pagination.total !== 1 ? "s" : ""} — page{" "}
              {pagination.page} / {pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchLogs(pagination.page - 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchLogs(pagination.page + 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
