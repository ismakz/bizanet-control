import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const phone = "0888888889";
  const password = "admin123";

  // Check if test company exists
  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Test Company",
        slug: "test-company-" + Date.now(),
        status: "ACTIVE"
      }
    });
  }

  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing) {
    console.log("Test admin already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      fullName: "Admin Test",
      phone: phone,
      passwordHash: passwordHash,
      role: "COMPANY_ADMIN",
      companyId: company.id
    }
  });

  console.log("Test COMPANY_ADMIN created with phone:", admin.phone);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
