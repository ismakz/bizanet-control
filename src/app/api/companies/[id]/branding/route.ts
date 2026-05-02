import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Only CEO or COMPANY_ADMIN of that company can update
    if (user.role !== "BIZANET_CEO" && (user.role !== "COMPANY_ADMIN" || user.companyId !== params.id)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = await req.json();
    const { logoUrl } = body;

    const dataToUpdate: any = {};
    if (logoUrl !== undefined) {
      if (logoUrl && !logoUrl.startsWith("data:image/")) {
        return NextResponse.json({ error: "Format d'image invalide" }, { status: 400 });
      }
      dataToUpdate.logoUrl = logoUrl;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: params.id },
      data: dataToUpdate,
    });

    return NextResponse.json(updatedCompany);
  } catch (error: any) {
    console.error("Error updating company branding:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}
