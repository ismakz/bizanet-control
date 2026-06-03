"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Package, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDuration } from "@/lib/time";
import { DurationUnit, AccessType } from "@prisma/client";

type Plan = {
  id: string;
  name: string;
  price: string;
  durationValue: number;
  durationUnit: DurationUnit;
  accessType: AccessType;
  downloadLimitMbps: number;
  uploadLimitMbps: number;
  createdAt: string;
  company?: { currency: string };
};

const DEFAULT_FORM = {
  name: "",
  price: "0",
  durationValue: 30,
  durationUnit: "DAY" as DurationUnit,
  accessType: "HOTSPOT_WIFI" as AccessType,
  downloadLimitMbps: 10,
  uploadLimitMbps: 5,
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState(DEFAULT_FORM);

  function showToast(kind: "ok" | "err", text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  }

  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingPlanId(null);
    setError(null);
  }

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Erreur lors du chargement");
      const data = (await res.json()) as { plans: Plan[]; currency?: string };
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

  function validateForm(): string | null {
    if (!form.name.trim()) return "Le nom du forfait est requis";
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) return "Le prix doit être supérieur à 0";
    if (form.durationValue <= 0) return "La durée doit être supérieure à 0";
    if (form.downloadLimitMbps <= 0 || form.uploadLimitMbps <= 0) {
      return "Les débits doivent être supérieurs à 0";
    }
    return null;
  }

  function startEdit(plan: Plan) {
    setEditingPlanId(plan.id);
    setForm({
      name: plan.name,
      price: String(plan.price),
      durationValue: plan.durationValue,
      durationUnit: plan.durationUnit,
      accessType: plan.accessType,
      downloadLimitMbps: plan.downloadLimitMbps,
      uploadLimitMbps: plan.uploadLimitMbps,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      price: Number(form.price),
    };

    setSubmitting(true);
    try {
      const url = editingPlanId ? `/api/plans/${editingPlanId}` : "/api/plans";
      const method = editingPlanId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Opération impossible");
        showToast("err", data?.error ?? "Opération impossible");
        return;
      }

      if (data?.mikrotikSync?.warnings?.length) {
        showToast(
          "ok",
          editingPlanId
            ? `Forfait mis à jour (avertissement MikroTik : ${data.mikrotikSync.warnings[0]})`
            : `Forfait créé`
        );
      } else {
        showToast(
          "ok",
          editingPlanId ? "Forfait mis à jour avec succès" : "Forfait créé avec succès"
        );
      }

      resetForm();
      await load();
    } catch {
      setError("Erreur réseau");
      showToast("err", "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/plans/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast("err", data?.error ?? "Suppression impossible");
        return;
      }

      if (editingPlanId === deleteTarget.id) resetForm();
      showToast("ok", `Forfait « ${deleteTarget.name} » supprimé`);
      setDeleteTarget(null);
      await load();
    } catch {
      showToast("err", "Erreur réseau");
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { header: "Nom du Plan", accessorKey: "name" as const },
    {
      header: "Prix",
      cell: (p: Plan) => (
        <span className="font-medium text-white">
          {formatCurrency(p.price, p.company?.currency)}
        </span>
      ),
    },
    {
      header: "Durée",
      cell: (p: Plan) => formatDuration(p.durationValue, p.durationUnit),
    },
    {
      header: "Type",
      cell: (p: Plan) => {
        if (p.accessType === "HOTSPOT_WIFI") return "WiFi Hotspot";
        if (p.accessType === "WIRED_ETHERNET") return "Câble Ethernet";
        if (p.accessType === "PPPOE") return "PPPoE";
        return p.accessType;
      },
    },
    {
      header: "Téléchargement",
      cell: (p: Plan) => `${p.downloadLimitMbps} Mbps`,
    },
    {
      header: "Envoi",
      cell: (p: Plan) => `${p.uploadLimitMbps} Mbps`,
    },
    {
      header: "Actions",
      cell: (p: Plan) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startEdit(p)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-xs font-medium text-cyan hover:bg-cyan/20 hover:border-cyan/50 transition"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(p)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 hover:border-red-400/50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>
        </div>
      ),
    },
  ];

  const isEditing = Boolean(editingPlanId);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Forfaits Internet
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Créez et gérez vos plans de facturation
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan" />
              <h2 className="text-base font-semibold text-white">
                {isEditing ? "Modifier le forfait" : "Nouveau forfait"}
              </h2>
            </div>
            {isEditing && (
              <span className="text-[10px] uppercase tracking-wider text-cyan/80 border border-cyan/20 rounded-full px-2 py-0.5">
                Édition
              </span>
            )}
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
                min="0.01"
                value={form.price}
                onChange={(ev) => setForm((s) => ({ ...s, price: ev.target.value }))}
                className="form-input"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Durée">
                <input
                  type="number"
                  min="1"
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
                  <option value="MINUTE" className="bg-[#050A10]">
                    Minutes
                  </option>
                  <option value="HOUR" className="bg-[#050A10]">
                    Heures
                  </option>
                  <option value="DAY" className="bg-[#050A10]">
                    Jours
                  </option>
                  <option value="MONTH" className="bg-[#050A10]">
                    Mois
                  </option>
                  <option value="YEAR" className="bg-[#050A10]">
                    Années
                  </option>
                </select>
              </Field>
            </div>

            <Field label="Type d'accès">
              <select
                value={form.accessType}
                onChange={(ev) =>
                  setForm((s) => ({ ...s, accessType: ev.target.value as AccessType }))
                }
                className="form-select"
              >
                <option value="HOTSPOT_WIFI" className="bg-[#050A10]">
                  WiFi Hotspot
                </option>
                <option value="WIRED_ETHERNET" className="bg-[#050A10]">
                  Câble Ethernet
                </option>
                <option value="PPPOE" className="bg-[#050A10]">
                  PPPoE
                </option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Max Download (Mbps)">
                <input
                  type="number"
                  min="1"
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
                  min="1"
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
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEditing ? "Mise à jour..." : "Création..."}
                </>
              ) : isEditing ? (
                "Mettre à jour le forfait"
              ) : (
                "Créer le forfait"
              )}
            </button>

            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                disabled={submitting}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Annuler modification
              </button>
            )}
          </form>
        </div>

        <div className="lg:col-span-3">
          {loading && plans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md p-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-cyan mx-auto mb-2" />
              <p className="text-white/50">Chargement des forfaits...</p>
            </div>
          ) : (
            <DataTable
              data={plans}
              columns={columns}
              keyExtractor={(p) => p.id}
              emptyMessage="Aucun forfait pour le moment"
            />
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Supprimer le forfait"
        message={
          deleteTarget
            ? `Confirmer la suppression de « ${deleteTarget.name} » ? Cette action est irréversible.`
            : ""
        }
        confirmText={deleting ? "Suppression..." : "Supprimer"}
        cancelText="Annuler"
        isDestructive
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
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

