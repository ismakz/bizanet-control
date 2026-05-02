import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { fullName, profileImageUrl } = body;

    const dataToUpdate: any = {};
    if (fullName !== undefined) dataToUpdate.fullName = fullName;
    if (profileImageUrl !== undefined) {
      // Basic validation for base64
      if (profileImageUrl && !profileImageUrl.startsWith("data:image/")) {
         return NextResponse.json({ error: "Format d'image invalide" }, { status: 400 });
      }
      dataToUpdate.profileImageUrl = profileImageUrl;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
    });

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour du profil" }, { status: 500 });
  }
}
