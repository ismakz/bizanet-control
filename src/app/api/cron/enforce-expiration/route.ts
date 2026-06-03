import { NextResponse } from "next/server";
import { runExpirationEnforcer } from "@/lib/mikrotik-expiration-enforcer";

/** CRON Vercel — coupure tickets expirés (min 1 min sur Vercel). */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const key = new URL(req.url).searchParams.get("key");
    if (secret && key !== secret) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const result = await runExpirationEnforcer();
    return NextResponse.json({ success: true, result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
