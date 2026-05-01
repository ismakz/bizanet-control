import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Démarrage de la réinitialisation des utilisateurs (Dev uniquement)...");

  // 1. Hash the new temporary password
  const tempPassword = "admin123";
  const hashedPassword = await hash(tempPassword, 10);

  // 2. Reset all passwords
  await prisma.user.updateMany({
    data: {
      passwordHash: hashedPassword,
      mustChangePassword: false,
    },
  });

  // 3. Fetch all users for display
  const users = await prisma.user.findMany({
    include: {
      company: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      role: 'asc',
    }
  });

  // 4. Format data for display
  const displayData = users.map(user => ({
    "Nom": user.fullName,
    "Téléphone": user.phone,
    "Mot de passe temporaire": tempPassword,
    "Rôle": user.role,
    "Company": user.company?.name || "N/A",
  }));

  // 5. Display table
  console.log("\n=== LISTE DES UTILISATEURS ===");
  console.table(displayData);
  
  console.log("\n✅ Tous les comptes ont maintenant le mot de passe temporaire admin123");
}

main()
  .catch((e) => {
    console.error("Erreur lors de l'exécution du script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
