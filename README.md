# BizaNet Control

Template Next.js (App Router) + TypeScript + Tailwind + Prisma (SQLite dev).

## Démarrage

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Le seed est configuré dans Prisma (`prisma/seed.ts`). Pour le lancer :

```bash
npx prisma db seed
```

