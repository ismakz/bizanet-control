import { prisma } from "@/lib/prisma";
import { CustomerStatus, Role, PaymentStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTenantWhere } from "@/lib/permissions";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/currency";
import Link from "next/link";
import { 
  Building2, Server, Users, CreditCard, Activity, Package, AlertCircle, 
  Wifi, UserPlus, FilePlus, DollarSign, Clock, SearchX, CheckCircle, MapPin, KeyRound, Zap, Wallet
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DesktopDownloadBlock } from "@/components/desktop/DesktopDownloadBlock";

function isMissingColumnError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2022"
  );
}

function DashboardEmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B131E]/80 p-8 text-center">
      <SearchX className="mx-auto mb-3 h-10 w-10 text-white/30" />
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-white/60">{description}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex rounded-lg border border-cyan/30 bg-cyan/10 px-4 py-2 text-sm font-medium text-cyan hover:bg-cyan/20"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/api/auth/logout");
  }
  const isCeo = user.role === Role.BIZANET_CEO;
  const auth = { userId: user.id, role: user.role, companyId: user.companyId };

  if (isCeo) {
    const [companies, routers, usersCount, subscriptions] = await Promise.all([
      prisma.company.count(),
      prisma.router.count(),
      prisma.user.count(),
      prisma.internetSubscription.count(),
    ]);
    
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Global Command Center</h1>
          <p className="text-sm text-white/60">Bienvenue, {user.fullName}. Voici un aperçu de vos activités globales.</p>
        </div>

        <DesktopDownloadBlock variant="card" />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Companies" value={companies} icon={Building2} trend="12%" trendUp={true} />
          <StatCard title="Total Routers" value={routers} icon={Server} trend="4 offline" trendUp={false} />
          <StatCard title="Total Users" value={usersCount} icon={Users} />
          <StatCard title="Global Subscriptions" value={subscriptions} icon={Activity} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-cyan" />
              <h2 className="text-lg font-medium text-white">Vue rapide</h2>
            </div>
            <p className="text-sm text-white/70">
              Gérez l'ensemble des franchises BizaNet. Ajoutez de nouvelles compagnies, configurez les routeurs et supervisez le réseau global.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- COMPANY AGENT DASHBOARD ---
  if (user.role === Role.COMPANY_AGENT) {
    if (!user.companyId) {
      return (
        <DashboardEmptyState
          title="Compte revendeur incomplet"
          description="Votre compte n'est pas encore rattaché à une company. Contactez votre administrateur BizaNet."
        />
      );
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let company: {
      id: string;
      name: string;
      city: string;
      country: string;
      currency: string;
      saasPlan: string | null;
      saasExpiresAt: Date | null;
    } | null = null;
    let wallet: Awaited<ReturnType<typeof prisma.wallet.findUnique>> = null;
    let tokensToday = 0;
    let tokensTotal = 0;
    try {
      [company, wallet, tokensToday, tokensTotal] = await Promise.all([
        prisma.company.findUnique({
          where: { id: user.companyId },
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
            currency: true,
            saasPlan: true,
            saasExpiresAt: true,
          },
        }),
        prisma.wallet.findUnique({ where: { userId: user.id } }),
        prisma.accessToken.count({ where: { generatedByUserId: user.id, createdAt: { gte: startOfDay } } }),
        prisma.accessToken.count({ where: { generatedByUserId: user.id } }),
      ]);
    } catch {
      return (
        <DashboardEmptyState
          title="Impossible de charger le dashboard"
          description="Une erreur temporaire est survenue pendant le chargement. Réessayez dans quelques instants."
        />
      );
    }

    if (!company) {
      return (
        <DashboardEmptyState
          title="Company introuvable"
          description="Votre compte revendeur ne pointe vers aucune company active."
        />
      );
    }
    const currency = company.currency;

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Espace Revendeur</h1>
          <p className="text-sm text-white/60">Bienvenue, {user.fullName}. Gérez vos ventes de tickets.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Solde Virtuel (Wallet)" value={formatCurrency(Number(wallet?.balance || 0), currency)} icon={DollarSign} trend="Disponible pour vendre" trendUp={true} />
          <StatCard title="Tickets Vendus (Aujourd'hui)" value={tokensToday} icon={Activity} />
          <StatCard title="Total Tickets Vendus" value={tokensTotal} icon={KeyRound} />
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <Link href="/dashboard/quick-sale" className="card p-6 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition border-cyan/20">
            <div className="p-3 bg-cyan/10 rounded-full text-cyan">
              <Zap className="w-8 h-8" />
            </div>
            <span className="text-lg font-bold text-white">Vente Rapide</span>
          </Link>
          <Link href="/dashboard/wallet" className="card p-6 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition border-purple-500/20">
            <div className="p-3 bg-purple-500/10 rounded-full text-purple-400">
              <Wallet className="w-8 h-8" />
            </div>
            <span className="text-lg font-bold text-white">Mon Portefeuille</span>
          </Link>
        </div>
      </div>
    );
  }

  // --- COMPANY ADMIN DASHBOARD ---
  if (!user.companyId) {
    return (
      <DashboardEmptyState
        title="Compte administrateur incomplet"
        description="Votre compte COMPANY_ADMIN n'est pas encore rattaché à une company. Contactez le support BizaNet."
      />
    );
  }

  const tenantWhere = getTenantWhere(auth);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let company: {
    id: string;
    name: string;
    city: string;
    country: string;
    currency: string;
    saasPlan: string | null;
    saasExpiresAt: Date | null;
  } | null = null;
  let customersActive = 0;
  let customersExpired = 0;
  let customersSuspended = 0;
  let plansTotal = 0;
  let paymentsPending = 0;
  let failedActivations = 0;
  let recentCustomers: Array<{
    id: string;
    fullName: string | null;
    status: CustomerStatus;
    expiresAt: Date;
    createdAt: Date;
  }> = [];
  let recentPayments: Array<{
    id: string;
    amount: { toString(): string };
    status: string;
    customer?: { fullName: string | null } | null;
  }> = [];
  let routers: Array<{ id: string; status: string; name: string }> = [];
  let tokensUnused = 0;
  let dailyPaymentsAmount = 0;
  let monthlyPaymentsAmount = 0;
  let dailyTopupsAmount = 0;
  let monthlyTopupsAmount = 0;

  try {
    const [
      loadedCompany,
      loadedCustomersActive,
      loadedCustomersExpired,
      loadedCustomersSuspended,
      loadedPlansTotal,
      loadedPaymentsPending,
      dailyPayments,
      monthlyPayments,
      loadedFailedActivations,
      loadedRecentCustomers,
      loadedRecentPayments,
      loadedRouters,
      _tokensGeneratedToday,
      loadedTokensUnused,
      dailyTopups,
      monthlyTopups,
    ] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          id: true,
          name: true,
          city: true,
          country: true,
          currency: true,
          saasPlan: true,
          saasExpiresAt: true,
        },
      }),
      prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.ACTIVE } }),
      prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.EXPIRED } }),
      prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.SUSPENDED } }),
      prisma.plan.count({ where: tenantWhere }),
      prisma.payment.count({ where: { ...tenantWhere, status: "PENDING" } }),
      prisma.payment.aggregate({
        where: {
          ...tenantWhere,
          status: "APPROVED",
          createdAt: { gte: startOfDay },
          OR: [{ createdByUserId: null }, { createdByUser: { role: { not: Role.COMPANY_AGENT } } }],
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          ...tenantWhere,
          status: "APPROVED",
          createdAt: { gte: startOfMonth },
          OR: [{ createdByUserId: null }, { createdByUser: { role: { not: Role.COMPANY_AGENT } } }],
        },
        _sum: { amount: true },
      }),
      prisma.internetSubscription.count({
        where: { ...tenantWhere, networkActivationStatus: "FAILED" },
      }),
      prisma.customer.findMany({
        where: tenantWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          fullName: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        where: tenantWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          amount: true,
          status: true,
          customer: { select: { fullName: true } },
          createdAt: true,
        },
      }),
      prisma.router.findMany({
        where: tenantWhere,
        select: { id: true, status: true, name: true },
      }),
      prisma.accessToken.count({ where: { ...tenantWhere, createdAt: { gte: startOfDay } } }),
      prisma.accessToken.count({ where: { ...tenantWhere, status: "UNUSED" } }),
      prisma.walletTransaction.aggregate({
        where: { companyId: user.companyId, source: "ADMIN_TOPUP", type: "CREDIT", createdAt: { gte: startOfDay } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { companyId: user.companyId, source: "ADMIN_TOPUP", type: "CREDIT", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    company = loadedCompany;
    customersActive = loadedCustomersActive;
    customersExpired = loadedCustomersExpired;
    customersSuspended = loadedCustomersSuspended;
    plansTotal = loadedPlansTotal;
    paymentsPending = loadedPaymentsPending;
    failedActivations = loadedFailedActivations;
    recentCustomers = loadedRecentCustomers;
    recentPayments = loadedRecentPayments;
    routers = loadedRouters as typeof routers;
    tokensUnused = loadedTokensUnused;
    dailyPaymentsAmount = Number(dailyPayments?._sum?.amount ?? 0);
    monthlyPaymentsAmount = Number(monthlyPayments?._sum?.amount ?? 0);
    dailyTopupsAmount = Number(dailyTopups?._sum?.amount ?? 0);
    monthlyTopupsAmount = Number(monthlyTopups?._sum?.amount ?? 0);
  } catch (error) {
    // Legacy fallback for partially migrated production schemas.
    if (!isMissingColumnError(error)) {
      return (
        <DashboardEmptyState
          title="Dashboard indisponible"
          description="Une erreur est survenue pendant le chargement des statistiques. Réessayez, puis contactez le support si le problème persiste."
        />
      );
    }

    try {
      const [
        loadedCompany,
        loadedCustomersActive,
        loadedCustomersExpired,
        loadedCustomersSuspended,
        loadedPlansTotal,
        loadedPaymentsPending,
        loadedRecentCustomers,
        loadedRecentPayments,
        loadedRouters,
      ] = await Promise.all([
        prisma.company.findUnique({
          where: { id: user.companyId },
          select: {
            id: true,
            name: true,
            city: true,
            country: true,
            currency: true,
            saasPlan: true,
            saasExpiresAt: true,
          },
        }),
        prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.ACTIVE } }),
        prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.EXPIRED } }),
        prisma.customer.count({ where: { ...tenantWhere, status: CustomerStatus.SUSPENDED } }),
        prisma.plan.count({ where: tenantWhere }),
        prisma.payment.count({ where: { ...tenantWhere, status: "PENDING" } }),
        prisma.customer.findMany({
          where: tenantWhere,
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            fullName: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
        prisma.payment.findMany({
          where: tenantWhere,
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            status: true,
            customer: { select: { fullName: true } },
            createdAt: true,
          },
        }),
        prisma.router.findMany({
          where: tenantWhere,
          select: { id: true, status: true, name: true },
        }),
      ]);

      company = loadedCompany;
      customersActive = loadedCustomersActive;
      customersExpired = loadedCustomersExpired;
      customersSuspended = loadedCustomersSuspended;
      plansTotal = loadedPlansTotal;
      paymentsPending = loadedPaymentsPending;
      failedActivations = 0;
      recentCustomers = loadedRecentCustomers;
      recentPayments = loadedRecentPayments;
      routers = loadedRouters as typeof routers;
      tokensUnused = 0;
      dailyPaymentsAmount = 0;
      monthlyPaymentsAmount = 0;
      dailyTopupsAmount = 0;
      monthlyTopupsAmount = 0;
    } catch {
      return (
        <DashboardEmptyState
          title="Dashboard indisponible"
          description="Une erreur est survenue pendant le chargement des statistiques. Réessayez, puis contactez le support si le problème persiste."
        />
      );
    }
  }

  if (!company) {
    return (
      <DashboardEmptyState
        title="Company introuvable"
        description="Aucune company active n'est liée à ce compte administrateur."
      />
    );
  }

  const currency = company.currency;
  const routerOnline = routers.some(r => r.status === "ONLINE");
  const routerStatusText = routers.length === 0 ? "No Router" : routerOnline ? "En ligne" : "Hors ligne";
  const companyLocation = [company.city, company.country].filter(Boolean).join(", ") || "Localisation non renseignée";
  const hasAnyCoreData = customersActive + customersExpired + customersSuspended + plansTotal + recentPayments.length + routers.length > 0;

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{company.name || "Ma Company"}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {companyLocation}</span>
            <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> {currency}</span>
            <span className="flex items-center gap-1">
              <Server className={`w-4 h-4 ${routerOnline ? 'text-green-400' : 'text-red-400'}`} /> 
              Routeur {routerStatusText}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-white/50">Abonnement SaaS BizaNet</div>
          <div className="font-medium text-cyan flex items-center justify-end gap-2">
            {company.saasPlan || "Standard"}
            {company.saasExpiresAt && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan/10 border border-cyan/20">
                Expire le {company.saasExpiresAt.toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {!hasAnyCoreData ? (
        <DashboardEmptyState
          title="Company prête à démarrer"
          description="Aucune donnée métier n'existe encore (routeur, forfait, client ou paiement). Commencez par configurer un routeur MikroTik puis créez un forfait."
          ctaHref="/dashboard/routers"
          ctaLabel="Configurer MikroTik"
        />
      ) : null}

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Clients actifs" value={customersActive} icon={Users} trend="Connectés" trendUp={true} />
        <StatCard title="Tokens Non Utilisés" value={tokensUnused} icon={KeyRound} trend="En stock" trendUp={true} />
        <StatCard title="Revenus (Aujourd'hui)" value={formatCurrency((dailyPaymentsAmount + dailyTopupsAmount).toString(), currency)} icon={CreditCard} trend="Ventes directes + Recharges" trendUp={true} />
        <StatCard title="Revenus (Ce mois)" value={formatCurrency((monthlyPaymentsAmount + monthlyTopupsAmount).toString(), currency)} icon={Activity} />
      </div>

      {/* ALERTES SI NECESSAIRE */}
      {(paymentsPending > 0 || failedActivations > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paymentsPending > 0 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-500" />
                <div>
                  <div className="text-sm font-medium text-yellow-500">Paiements en attente</div>
                  <div className="text-xs text-yellow-500/70">{paymentsPending} paiement(s) nécessitent votre approbation.</div>
                </div>
              </div>
              <Link href="/dashboard/payments" className="text-xs font-semibold text-yellow-500 hover:text-yellow-400">Voir</Link>
            </div>
          )}
          {failedActivations > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-sm font-medium text-red-500">Échecs réseau</div>
                  <div className="text-xs text-red-500/70">{failedActivations} activation(s) réseau ont échoué.</div>
                </div>
              </div>
              <Link href="/dashboard/subscriptions" className="text-xs font-semibold text-red-500 hover:text-red-400">Réparer</Link>
            </div>
          )}
        </div>
      )}

      {/* 3. QUICK ACTIONS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/dashboard/tokens/generate" className="card p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition border-cyan/20">
          <KeyRound className="w-6 h-6 text-cyan" />
          <span className="text-sm font-medium text-white">Générer Tokens</span>
        </Link>
        <Link href="/dashboard/payments" className="card p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition border-green-500/20">
          <CreditCard className="w-6 h-6 text-green-400" />
          <span className="text-sm font-medium text-white">Enregistrer Paiement</span>
        </Link>
        <Link href="/dashboard/plans" className="card p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition border-purple-500/20">
          <Package className="w-6 h-6 text-purple-400" />
          <span className="text-sm font-medium text-white">Créer Forfait</span>
        </Link>
        <Link href="/dashboard/support" className="card p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition border-blue/20">
          <Wifi className="w-6 h-6 text-blue" />
          <span className="text-sm font-medium text-white">Support Technique</span>
        </Link>
      </div>

      {/* 4. RECENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Derniers Clients</h3>
            <Link href="/dashboard/customers" className="text-xs text-cyan hover:underline">Voir tout</Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs uppercase text-white/40 border-b border-white/5">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Nom</th>
                  <th className="pb-2 pr-4 font-medium">Statut</th>
                  <th className="pb-2 font-medium">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentCustomers.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-center text-white/40">Aucun client</td></tr>
                ) : (
                  recentCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="py-3 pr-4 text-white/90">{c.fullName}</td>
                      <td className="py-3 pr-4"><StatusBadge status={c.status} /></td>
                      <td className="py-3 text-white/60">{new Date(c.expiresAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Derniers Paiements</h3>
            <Link href="/dashboard/payments" className="text-xs text-cyan hover:underline">Voir tout</Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="text-xs uppercase text-white/40 border-b border-white/5">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Client</th>
                  <th className="pb-2 pr-4 font-medium">Montant</th>
                  <th className="pb-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentPayments.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-center text-white/40">Aucun paiement</td></tr>
                ) : (
                  recentPayments.map(p => (
                    <tr key={p.id}>
                      <td className="py-3 pr-4 text-white/90 truncate max-w-[120px]">{p.customer?.fullName || "Client inconnu"}</td>
                      <td className="py-3 pr-4 text-white/90">{formatCurrency(p.amount.toString(), currency)}</td>
                      <td className="py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
    </div>
  );
}
