import {
  CustomerStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Début du seed de la base de données...");

  // 1. Check if a CEO already exists
  const existingCeo = await prisma.user.findFirst({
    where: { role: Role.BIZANET_CEO }
  });

  if (existingCeo) {
    console.log("✅ Un compte CEO existe déjà. Le seed de production ne recréera pas de compte CEO.");
  } else {
    console.warn("⚠️ ATTENTION : Aucun compte CEO trouvé. Création d'un compte CEO initial.");
    
    // En production, il vaut mieux utiliser une variable d'environnement pour le mot de passe
    const ceoPassword = process.env.INITIAL_CEO_PASSWORD || "admin123";
    
    if (ceoPassword === "admin123") {
      console.warn("🚨 ALERTE DE SÉCURITÉ : Le mot de passe par défaut 'admin123' est utilisé pour le CEO !");
      console.warn("🚨 VEUILLEZ CHANGER CE MOT DE PASSE IMMÉDIATEMENT APRÈS LA CONNEXION !");
    }

    const ceoHash = await bcrypt.hash(ceoPassword, 10);
    await prisma.user.create({
      data: {
        fullName: "BizaNet CEO",
        phone: "0999999999",
        email: "ceo@bizanet.local",
        role: Role.BIZANET_CEO,
        passwordHash: ceoHash,
        companyId: null,
      },
    });
    console.log(`✅ Utilisateur CEO créé : 0999999999 / ${ceoPassword === "admin123" ? "admin123" : "*** (masqué)"}`);
  }

  // Ne pas créer la Demo Company en production (sauf si on est explicitement en mode dev)
  if (process.env.NODE_ENV === "production") {
    console.log("🛑 Mode Production détecté : Seed terminé. Aucune donnée de démo (Compagnies/Clients) ne sera générée.");
    return;
  }

  console.log("🛠 Mode Développement : Création des données de démo...");


  const company = await prisma.company.upsert({
    where: { slug: "demo-company" },
    update: {
      name: "Demo Company",
      ownerName: "Demo Owner",
      ownerPhone: "+221770000999",
      country: "Senegal",
      city: "Dakar",
    },
    create: {
      slug: "demo-company",
      name: "Demo Company",
      ownerName: "Demo Owner",
      ownerPhone: "+221770000999",
      country: "Senegal",
      city: "Dakar",
    },
  });

  const adminHash = await bcrypt.hash("AdminPassw0rd!1", 10);

  await prisma.user.upsert({
    where: { email: "admin@demo.bizanet.local" },
    update: {
      fullName: "Demo Admin",
      phone: "+221770000123",
      role: Role.COMPANY_ADMIN,
      passwordHash: adminHash,
      companyId: company.id,
    },
    create: {
      fullName: "Demo Admin",
      phone: "+221770000123",
      email: "admin@demo.bizanet.local",
      role: Role.COMPANY_ADMIN,
      passwordHash: adminHash,
      companyId: company.id,
    },
  });

  const router = await prisma.router.upsert({
    where: {
      companyId_host: {
        companyId: company.id,
        host: "192.168.88.1",
      },
    },
    update: {
      name: "MikroTik Main",
      username: "admin",
      encryptedPassword: encrypt("mikrotik-demo-password"),
    },
    create: {
      companyId: company.id,
      name: "MikroTik Main",
      host: "192.168.88.1",
      username: "admin",
      encryptedPassword: encrypt("mikrotik-demo-password"),
    },
  });

  const plans = [
    {
      name: "Starter 15 Mbps",
      price: new Prisma.Decimal("2000.00"),
      durationValue: 30,
      durationUnit: "DAY" as any,
      downloadLimitMbps: 15,
      uploadLimitMbps: 5,
    },
    {
      name: "Business 30 Mbps",
      price: new Prisma.Decimal("3500.00"),
      durationValue: 30,
      durationUnit: "DAY" as any,
      downloadLimitMbps: 30,
      uploadLimitMbps: 10,
    },
  ];

  const dbPlans: any[] = [];
  for (const p of plans) {
    const plan = await prisma.plan.upsert({
      where: {
        companyId_name: {
          companyId: company.id,
          name: p.name,
        },
      },
      update: {
        price: p.price,
        durationValue: p.durationValue,
        durationUnit: p.durationUnit,
        downloadLimitMbps: p.downloadLimitMbps,
        uploadLimitMbps: p.uploadLimitMbps,
      },
      create: {
        companyId: company.id,
        name: p.name,
        price: p.price,
        durationValue: p.durationValue,
        durationUnit: p.durationUnit,
        downloadLimitMbps: p.downloadLimitMbps,
        uploadLimitMbps: p.uploadLimitMbps,
      },
    });
    dbPlans.push(plan);
  }

  const username = "test";
  const password = "TestPassw0rd!1";

  const customer = await prisma.customer.upsert({
    where: {
      companyId_username: {
        companyId: company.id,
        username,
      },
    },
    update: {
      companyId: company.id,
      fullName: "Customer Test",
      phone: "+221770000000",
      password: await bcrypt.hash(password, 10),
      status: CustomerStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      routerId: router.id,
    },
    create: {
      companyId: company.id,
      fullName: "Customer Test",
      phone: "+221770000000",
      username,
      password: await bcrypt.hash(password, 10),
      status: CustomerStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      routerId: router.id,
    },
  });

  const existingPayment = await prisma.payment.findFirst({
    where: { companyId: company.id, customerId: customer.id },
  });

  if (!existingPayment) {
    const payment = await prisma.payment.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        planId: dbPlans[0].id,
        amount: new Prisma.Decimal("2000.00"),
        method: PaymentMethod.CASH,
        status: PaymentStatus.APPROVED,
      },
    });

    await prisma.internetSubscription.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        planId: dbPlans[0].id,
        paymentId: payment.id,
        routerId: router.id,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });
  }
}

main()
  .catch((e) => {
    console.error("Prisma seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

