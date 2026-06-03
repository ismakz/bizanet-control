import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const CONNECTION_CLOSED_MARKERS = [
  "Server has closed the connection",
  "Connection terminated",
  "Connection reset",
  "ECONNRESET",
  "P1017",
] as const;

function isPrismaConnectionClosedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  const combined = `${code} ${message}`;
  return CONNECTION_CLOSED_MARKERS.some((marker) => combined.includes(marker));
}

/** Rétablit la connexion DB après une longue opération MikroTik (polling, sync live). */
export async function ensurePrismaConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    if (!isPrismaConnectionClosedError(error)) throw error;
    await prisma.$disconnect().catch(() => undefined);
    await prisma.$connect();
  }
}

/** Exécute une requête Prisma avec reconnexion automatique si le serveur a fermé la connexion. */
export async function withPrismaRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPrismaConnectionClosedError(error)) throw error;
    await prisma.$disconnect().catch(() => undefined);
    await prisma.$connect();
    return operation();
  }
}
