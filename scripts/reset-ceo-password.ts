import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const phone = '0999999999';
  const passwordStr = 'admin123';
  const passwordHash = await bcryptjs.hash(passwordStr, 10);

  await prisma.user.update({
    where: { phone },
    data: { passwordHash }
  });

  console.log('CEO reset OK');
  console.log(`Téléphone : ${phone}`);
  console.log(`Mot de passe : ${passwordStr}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
