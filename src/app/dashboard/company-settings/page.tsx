import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CompanySettingsClient from "./CompanySettingsClient";
import { redirect } from "next/navigation";

export default async function CompanySettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPANY_ADMIN") {
    redirect("/dashboard");
  }

  if (!user.companyId) {
    return <div>Aucune entreprise associée.</div>;
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { id: true, name: true, logoUrl: true }
  });

  if (!company) {
    return <div>Entreprise introuvable.</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Paramètres de l'entreprise</h1>
        <p className="text-sm text-white/50">
          Modifiez le nom de votre cybercafé et le logo affichés partout dans BizaNet Control.
        </p>
      </div>

      <CompanySettingsClient company={company} />
    </div>
  );
}
