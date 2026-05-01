"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Package, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDuration } from "@/lib/time";
import { DurationUnit } from "@prisma/client";

type Plan = {
  id: string;
  name: string;
  price: string;
  durationValue: number;
  durationUnit: DurationUnit;
  downloadLimitMbps: number;
  uploadLimitMbps: number;
  createdAt: string;
  company?: { currency: string };
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencyCode, setCurrencyCode] = useState("USD");

  const [form, setForm] = useState({
    name: "",
    price: "0",
    durationValue: 30,
    durationUnit: "DAY" as DurationUnit,
    downloadLimitMbps: 10,
    uploadLimitMbps: 5
  });

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Erreur lors du chargement");
      const data = (await res.json()) as { plans: Plan[], currency?: string };
      setPlans(data.plans);
      if (data.currency) setCurrencyCode(data.currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      ...form,
      price: Number(form.price)
    };

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Impossible de créer le plan");
      return;
    }

      setForm({
        name: "",
        price: "0",
        durationValue: 30,
        durationUnit: "DAY" as DurationUnit,
        downloadLimitMbps: 10,
        uploadLimitMbps: 5
      });
    await load();
  }

  const columns = [
    { header: "Nom du Plan", accessorKey: "name" as const },
    { 
      header: "Prix", 
      cell: (p: Plan) => <span className="font-medium text-white">{formatCurrency(p.price, p.company?.currency)}</span>
    },
    {
      header: "Durée",
      cell: (p: Plan) => formatDuration(p.durationValue, p.durationUnit)
    },
    { 
      header: "Téléchargement", 
      cell: (p: Plan) => `${p.downloadLimitMbps} Mbps` 
    },
    { 
      header: "Envoi", 
      cell: (p: Plan) => `${p.uploadLimitMbps} Mbps` 
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Forfaits Internet</h1>
          <p className="text-sm text-white/50 mt-1">Créez et gérez vos plans de facturation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-cyan" />
            <h2 className="text-base font-semibold text-white">Nouveau forfait</h2>
          </div>
          
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Nom du forfait">
              <input
                value={form.name}
                onChange={(ev) => setForm((s) => ({ ...s, name: ev.target.value }))}
                className="form-input"
                placeholder="Starter / Business / Pro"
              />
            </Field>

            <Field label={`Prix (${currencyCode})`}>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(ev) => setForm((s) => ({ ...s, price: ev.target.value }))}
                className="form-input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Durée">
                <input
                  type="number"
                  value={form.durationValue}
                  onChange={(ev) =>
                    setForm((s) => ({ ...s, durationValue: Number(ev.target.value) }))
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Unité">
                <select
                  value={form.durationUnit}
                  onChange={(ev) =>
                    setForm((s) => ({ ...s, durationUnit: ev.target.value as DurationUnit }))
                  }
                  className="form-select"
                >
                  <option value="MINUTE" className="bg-[#050A10]">Minutes</option>
                  <option value="HOUR" className="bg-[#050A10]">Heures</option>
                  <option value="DAY" className="bg-[#050A10]">Jours</option>
                  <option value="MONTH" className="bg-[#050A10]">Mois</option>
                  <option value="YEAR" className="bg-[#050A10]">Années</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Max Download (Mbps)">
                <input
                  type="number"
                  value={form.downloadLimitMbps}
                  onChange={(ev) =>
                    setForm((s) => ({ ...s, downloadLimitMbps: Number(ev.target.value) }))
                  }
                  className="form-input"
                />
              </Field>

              <Field label="Max Upload (Mbps)">
                <input
                  type="number"
                  value={form.uploadLimitMbps}
                  onChange={(ev) =>
                    setForm((s) => ({ ...s, uploadLimitMbps: Number(ev.target.value) }))
                  }
                  className="form-input"
                />
              </Field>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50"
            >
              {loading ? "Création..." : "Créer le forfait"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-3">
          <DataTable 
            data={plans} 
            columns={columns} 
            keyExtractor={(p) => p.id} 
            emptyMessage={loading ? "Chargement des forfaits..." : "Aucun forfait pour le moment"}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="text-xs text-white/60">{label}</div>
      {children}
    </label>
  );
}

