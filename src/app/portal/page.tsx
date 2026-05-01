import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Wifi, Calendar, CreditCard, Activity, LogOut } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { getPaymentMethod } from "@/config/payment-methods";

async function getCustomer() {
  const token = cookies().get("customer_session")?.value;
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
    const payload = verify(token, secret) as any;
    if (payload.role !== "END_CUSTOMER") return null;

    const customer = await prisma.customer.findUnique({
      where: { id: payload.sub },
      include: {
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        payments: { orderBy: { createdAt: 'desc' }, take: 5, include: { plan: true } },
        company: { select: { name: true, ownerPhone: true, currency: true } }
      }
    });
    return customer;
  } catch (e) {
    return null;
  }
}

export default async function PortalDashboard() {
  const customer = await getCustomer();
  if (!customer) redirect("/portal/login");

  const activeSub = customer.subscriptions[0];
  const isExpired = new Date(customer.expiresAt).getTime() < Date.now();

  return (
    <div className="min-h-screen bg-[#050A10] text-white">
      <header className="border-b border-white/5 bg-[#0B131E]/80 backdrop-blur-xl px-6 py-4 flex justify-between items-center">
        <div className="font-bold text-lg text-white">Espace Client <span className="text-cyan">{customer.company.name}</span></div>
        <div className="text-sm text-white/50">{customer.fullName}</div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8 mt-4">
        
        <div className={`card p-6 border-l-4 ${isExpired || customer.status !== 'ACTIVE' ? 'border-red-500 bg-red-500/5' : 'border-emerald-500 bg-emerald-500/5'}`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${isExpired || customer.status !== 'ACTIVE' ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
              <Wifi className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Statut de la connexion</h2>
              <p className="text-sm text-white/60">
                {isExpired ? "Votre abonnement est expiré." : customer.status === 'ACTIVE' ? "Connecté et actif." : "Connexion suspendue."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4 text-cyan">
              <Calendar className="w-5 h-5" />
              <h3 className="font-semibold text-white">Mon Forfait Actuel</h3>
            </div>
            {activeSub ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-white/50">Forfait</div>
                  <div className="font-medium text-lg text-white">{activeSub.plan.name}</div>
                </div>
                <div>
                  <div className="text-sm text-white/50">Expire le</div>
                  <div className={`font-medium text-lg ${isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                    {new Date(customer.expiresAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/50">Aucun forfait actif.</p>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4 text-cyan">
              <Activity className="w-5 h-5" />
              <h3 className="font-semibold text-white">Support & Recharge</h3>
            </div>
            <p className="text-sm text-white/60 mb-6">
              Pour recharger votre compte ou si vous rencontrez un problème technique, veuillez contacter votre fournisseur :
            </p>
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
              <div className="text-xs text-white/50 uppercase">Service Client</div>
              <div className="text-xl font-bold text-white mt-1">{customer.company.ownerPhone}</div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4 text-cyan">
            <CreditCard className="w-5 h-5" />
            <h3 className="font-semibold text-white">Derniers Paiements</h3>
          </div>
          {customer.payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white/70">
                <thead className="bg-white/5 text-xs uppercase text-white/50">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Forfait</th>
                    <th className="px-4 py-3">Méthode</th>
                    <th className="px-4 py-3">Montant</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {customer.payments.map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{p.plan?.name || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1">
                          {getPaymentMethod(p.method).icon} {getPaymentMethod(p.method).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(Number(p.amount), customer.company.currency)}</td>
                      <td className="px-4 py-3">
                        {p.status === "APPROVED" && <span className="text-emerald-400">Approuvé</span>}
                        {p.status === "PENDING" && <span className="text-yellow-400">En attente</span>}
                        {p.status === "REJECTED" && <span className="text-red-400">Rejeté</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/50">Aucun paiement trouvé.</p>
          )}
        </div>

      </main>
    </div>
  );
}
