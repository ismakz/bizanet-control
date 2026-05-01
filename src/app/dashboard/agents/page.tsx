import { getCurrentUser } from "@/lib/auth";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/currency";
import { redirect } from "next/navigation";
import { Wallet, PlusCircle, Activity, UserPlus } from "lucide-react";
import { TopupModal } from "./TopupModal";
import { NewAgentModal } from "./NewAgentModal";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const auth = await getCurrentUser();
  
  if (!auth || auth.role !== Role.COMPANY_ADMIN || !auth.companyId) {
    redirect("/dashboard");
  }

  const agents = await prisma.user.findMany({
    where: { companyId: auth.companyId, role: Role.COMPANY_AGENT },
    include: {
      wallet: true,
      _count: {
        select: { generatedTokens: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const company = await prisma.company.findUnique({
    where: { id: auth.companyId },
    select: { currency: true }
  });

  const currency = company?.currency || "USD";
  const totalBalance = agents.reduce((acc, a) => acc + Number(a.wallet?.balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Agents Revendeurs</h1>
          <p className="text-sm text-white/50">Gérez vos revendeurs et leurs portefeuilles</p>
        </div>
        <NewAgentModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <UserPlus className="w-5 h-5 text-cyan" />
            <span className="text-sm font-medium">Total Agents</span>
          </div>
          <div className="text-3xl font-black text-white">{agents.length}</div>
        </div>

        <div className="card p-6 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <Wallet className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium">Fonds Distribués</span>
          </div>
          <div className="text-3xl font-black text-white">{formatCurrency(totalBalance, currency)}</div>
        </div>

        <div className="card p-6 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <Activity className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium">Tickets Générés</span>
          </div>
          <div className="text-3xl font-black text-white">
            {agents.reduce((acc, a) => acc + a._count.generatedTokens, 0)}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white/80">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="px-6 py-4 font-medium">Nom</th>
                <th className="px-6 py-4 font-medium">Téléphone</th>
                <th className="px-6 py-4 font-medium">Ventes</th>
                <th className="px-6 py-4 font-medium">Solde Wallet</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-white/40 italic">
                    Aucun agent trouvé
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{agent.fullName}</td>
                    <td className="px-6 py-4 font-mono">{agent.phone}</td>
                    <td className="px-6 py-4">{agent._count.generatedTokens} tokens</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 font-bold font-mono">
                        {formatCurrency(Number(agent.wallet?.balance || 0), currency)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <TopupModal agentId={agent.id} agentName={agent.fullName} currency={currency} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
