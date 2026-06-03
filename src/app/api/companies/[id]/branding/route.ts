import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(120).optional(),
  logoUrl: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const isCeo = user.role === Role.BIZANET_CEO;
    const isCompanyAdmin =
      user.role === Role.COMPANY_ADMIN && user.companyId === params.id;

    if (user.role === Role.COMPANY_AGENT) {
      return NextResponse.json(
        { error: "Les agents ne peuvent pas modifier le branding de l'entreprise." },
        { status: 403 }
      );
    }

    if (!isCeo && !isCompanyAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Rôle non autorisé pour cette action." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = patchSchema.parse(body);

    if (parsed.name === undefined && parsed.logoUrl === undefined) {
      return NextResponse.json(
        { error: "Aucune donnée à mettre à jour" },
        { status: 400 }
      );
    }

    const existing = await prisma.company.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const dataToUpdate: { name?: string; logoUrl?: string | null } = {};

    if (parsed.name !== undefined) {
      dataToUpdate.name = parsed.name.trim();
    }

    if (parsed.logoUrl !== undefined) {
      if (parsed.logoUrl && !parsed.logoUrl.startsWith("data:image/")) {
        return NextResponse.json(
          { error: "Format d'image invalide" },
          { status: 400 }
        );
      }
      dataToUpdate.logoUrl = parsed.logoUrl;
    }

    const updatedCompany = await prisma.company.update({
      where: { id: params.id },
      data: dataToUpdate,
      select: { id: true, name: true, logoUrl: true, city: true, country: true },
    });

    if (parsed.name !== undefined && parsed.name.trim() !== existing.name) {
      await writeAuditLog({
        actorUserId: user.id,
        companyId: updatedCompany.id,
        action: "COMPANY_NAME_UPDATED",
        entityType: "Company",
        message: `Nom entreprise: "${existing.name}" → "${updatedCompany.name}"`,
      });
    }

    return NextResponse.json({
      company: updatedCompany,
      message:
        parsed.name !== undefined
          ? "Nom de l'entreprise mis à jour avec succès."
          : undefined,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("Error updating company branding:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}
