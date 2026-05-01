import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs"; // Use bcryptjs to match your project

const prisma = new PrismaClient();

async function main() {
  const phone = "0777777777";
  const password = "admin123";

  const existing = await prisma.user.findUnique({
    where: { phone }
  });

  if (existing) {
    console.log("Admin déjà existant :", phone);
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: "Test Company Fresh",
      ownerName: "Test Owner",
      ownerPhone: "0777777777",
      city: "Kinshasa",
      country: "RDC",
      status: "ACTIVE",
      slug: "test-company-" + Date.now().toString().slice(-4), // Added slug to satisfy schema
    }
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName: "Test Admin Fresh",
      phone,
      passwordHash,
      role: "COMPANY_ADMIN",
      companyId: company.id,
      // Removed status: "ACTIVE" as it does not exist on User model
    }
  });

  console.log("COMPANY_ADMIN créé :");
  console.log("Téléphone :", phone);
  console.log("Mot de passe :", password);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
