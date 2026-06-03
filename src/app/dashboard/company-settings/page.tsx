import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CompanySettingsClient from "./CompanySettingsClient";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import Link from "next/link";

type PageProps = {
  searchParams: { companyId?: string };
};

export default async function CompanySettingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/dashboard");
  }

  const isCeo = user.role === Role.BIZANET_CEO;
  const isCompanyAdmin = user.role === Role.COMPANY_ADMIN;

  if (!isCeo && !isCompanyAdmin) {
    redirect("/dashboard");
  }

  let targetCompanyId: string | null = null;

  if (isCompanyAdmin) {
    if (!user.companyId) {
      return <div className="p-6 text-white">Aucune entreprise associée.</div>;
    }
    targetCompanyId = user.companyId;
  } else if (isCeo) {
    const requestedId = searchParams.companyId?.trim();
    if (!requestedId) {
      return (
        <div className="p-6 space-y-4">
          <h1 className="text-2xl font-bold text-white">Paramètres entreprise</h1>
          <p className="text-sm text-white/50">
            Sélectionnez une entreprise depuis la liste pour modifier son nom et son logo.
          </p>
          <Link
            href="/dashboard/companies"
            className="inline-flex rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-[#050A10]"
          >
            Voir les entreprises
          </Link>
        </div>
      );
    }
    targetCompanyId = requestedId;
  }

  const company = await prisma.company.findUnique({
    where: { id: targetCompanyId! },
    select: { id: true, name: true, logoUrl: true },
  });

  if (!company) {
    return <div className="p-6 text-white">Entreprise introuvable.</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        {isCeo ? (
          <Link
            href={`/dashboard/companies/${company.id}`}
            className="text-sm text-cyan hover:underline"
          >
            &larr; Retour à l&apos;entreprise
          </Link>
        ) : null}
        <h1 className="text-2xl font-bold text-white mt-2">
          Paramètres de l&apos;entreprise
        </h1>
        <p className="text-sm text-white/50">
          Modifiez le nom de votre cybercafé et le logo affichés partout dans BizaNet
          Control.
        </p>
      </div>

      <CompanySettingsClient company={company} />
    </div>
  );
}
