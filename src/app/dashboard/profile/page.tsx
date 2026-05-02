import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileClient from "./ProfileClient";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  let companyName = "Aucune";
  if (user.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true }
    });
    if (company) {
      companyName = company.name;
    }
  }

  const userData = {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    companyName: companyName,
    profileImageUrl: user.profileImageUrl || "",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mon Profil</h1>
        <p className="text-sm text-white/50">Gérez vos informations personnelles et votre sécurité.</p>
      </div>

      <ProfileClient initialUser={userData} />
    </div>
  );
}
