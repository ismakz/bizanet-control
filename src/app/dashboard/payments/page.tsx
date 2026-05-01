"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CreditCard, Plus, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { PAYMENT_METHODS, getPaymentMethod } from "@/config/payment-methods";

type Payment = {
  id: string;
  customerId: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
  customer?: { fullName: string; username: string; phone: string } | null;
};

type Customer = { id: string; fullName: string; username: string; phone: string; status: any; expiresAt: string; createdAt: string };

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencyCode, setCurrencyCode] = useState("USD");


  const statusOptions = useMemo(
    () => Object.values(PaymentStatus) as PaymentStatus[],
    []
  );

  const [form, setForm] = useState({
    customerId: "",
    planId: "",
    amount: "0",
    method: PaymentMethod.CASH as PaymentMethod,
    status: PaymentStatus.PENDING as PaymentStatus
  });

  async function load() {
    try {
      setLoading(true);
      const [custRes, payRes] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/payments")
      ]);

      if (!custRes.ok) throw new Error("Erreur chargement customers");
      if (!payRes.ok) throw new Error("Erreur chargement payments");

      const customersData = (await custRes.json()) as { customers: Customer[] };
      const paymentsData = (await payRes.json()) as { payments: Payment[], currency?: string };

      setCustomers(customersData.customers);
      setPayments(paymentsData.payments);
      if (paymentsData.currency) {
        setCurrencyCode(paymentsData.currency);
      }

      const planRes = await fetch("/api/plans");
      const plansData = await planRes.json();
      const fetchedPlans = plansData.plans || [];
      setPlans(fetchedPlans);
      if (fetchedPlans.length > 0 && fetchedPlans[0].company?.currency) {
        setCurrencyCode(fetchedPlans[0].company.currency);
      }

      setForm((s) => ({
        ...s,
        customerId: s.customerId || customersData.customers[0]?.id || "",
        planId: s.planId || fetchedPlans[0]?.id || ""
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.customerId) {
      setError("Sélectionnez un customer");
      return;
    }

    const payload = {
      ...form,
      amount: Number(form.amount)
    };

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Impossible de créer le paiement");
      return;
    }

    setForm({
      ...form,
      amount: "0",
      method: PaymentMethod.CASH,
      status: PaymentStatus.PENDING
    });
    await load();
  }

  async function onApprove(id: string) {
    if (!confirm("Voulez-vous vraiment approuver ce paiement ? L'accès internet sera activé.")) return;
    
    try {
      const res = await fetch(`/api/payments/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (data.warning) {
          alert("⚠️ " + data.message);
        } else {
          alert("✅ " + data.message);
        }
        await load();
      } else {
        alert("Erreur: " + (data.error || "Une erreur est survenue"));
      }
    } catch (e: any) {
      alert("Erreur: " + e.message);
    }
  }

  const columns = [
    { 
      header: "Client", 
      cell: (p: Payment) => <span className="font-medium text-white">{p.customer?.fullName ?? p.customerId}</span> 
    },
    { 
      header: "Montant", 
      cell: (p: Payment) => formatCurrency(p.amount, currencyCode)
    },
    { 
      header: "Méthode", 
      cell: (p: Payment) => {
        const method = getPaymentMethod(p.method);
        return <span className="flex items-center gap-1">{method.icon} {method.label}</span>;
      }
    },
    { 
      header: "Statut", 
      cell: (p: Payment) => <StatusBadge status={p.status} /> 
    },
    { 
      header: "Date", 
      cell: (p: Payment) => new Date(p.createdAt).toLocaleString("fr-FR") 
    },
    {
      header: "Actions",
      cell: (p: Payment) => (
        p.status === "PENDING" ? (
          <button 
            onClick={() => onApprove(p.id)}
            className="flex items-center gap-1 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition text-xs font-medium"
          >
            <CheckCircle className="w-3 h-3" /> Approuver
          </button>
        ) : <span className="text-xs text-white/30">-</span>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan/10 text-cyan">
          <CreditCard className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Paiements</h1>
          <p className="text-sm text-white/50 mt-1">Enregistrez et consultez les paiements des abonnés</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-cyan" />
            <h2 className="text-base font-semibold text-white">Ajouter un paiement</h2>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Client (Customer)">
              <select
                value={form.customerId}
                onChange={(ev) => setForm((s) => ({ ...s, customerId: ev.target.value }))}
                className="form-select"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#050A10]">
                    {c.fullName} ({c.username})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Forfait (Plan)">
              <select
                value={form.planId}
                onChange={(ev) => setForm((s) => ({ ...s, planId: ev.target.value }))}
                className="form-select"
              >
                <option value="" className="bg-[#050A10]">-- Sélectionner --</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#050A10]">
                    {p.name} ({formatCurrency(p.price, currencyCode)})
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Montant (${currencyCode})`}>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(ev) => setForm((s) => ({ ...s, amount: ev.target.value }))}
                className="form-input"
              />
            </Field>

            <Field label="Méthode de paiement">
              <select
                value={form.method}
                onChange={(ev) => setForm((s) => ({ ...s, method: ev.target.value as PaymentMethod }))}
                className="form-select"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.code} value={m.code} className="bg-[#050A10]">
                    {m.icon} {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Statut">
              <select
                value={form.status}
                onChange={(ev) => setForm((s) => ({ ...s, status: ev.target.value as PaymentStatus }))}
                className="form-select"
              >
                {statusOptions.map((st) => (
                  <option key={st} value={st} className="bg-[#050A10]">
                    {st}
                  </option>
                ))}
              </select>
            </Field>

            {error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-[#050A10] hover:bg-cyan/90 transition shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-3">
          <DataTable 
            data={payments} 
            columns={columns} 
            keyExtractor={(p) => p.id} 
            emptyMessage={loading ? "Chargement des paiements..." : "Aucun paiement pour le moment"}
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

