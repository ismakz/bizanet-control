const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    if (plan.durationDays !== null && plan.durationDays !== undefined) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          durationValue: plan.durationDays,
          durationUnit: 'DAY'
        }
      });
      console.log(`Updated plan ${plan.name} to ${plan.durationDays} DAY`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
