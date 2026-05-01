import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  let companyName = "";
  if (user.companyId) {
    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (company) {
      companyName = company.name;
    }
  }

  return (
    <DashboardShell
      userName={user.fullName}
      role={user.role}
      companyName={companyName}
    >
      {children}
    </DashboardShell>
  );
}
