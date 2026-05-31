import { NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import {
  agentGetHealth,
  agentGetStatus,
  AGENT_OFFLINE_MESSAGE,
} from "@/lib/mikrotik-agent";

/** Santé agent local (tunnel) — ne bloque pas le dashboard. */
export async function GET(req: Request) {
  try {
    await getAuthContextFromRequest(req);

    const [health, status] = await Promise.all([
      agentGetHealth(),
      agentGetStatus(),
    ]);

    const online = health.ok && status.ok;

    return NextResponse.json({
      online,
      message: online ? "Agent connecté" : AGENT_OFFLINE_MESSAGE,
      health: health.ok ? health.data : { error: health.error },
      router: status.ok ? status.data : { error: status.error },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }
    return NextResponse.json({
      online: false,
      message: AGENT_OFFLINE_MESSAGE,
    });
  }
}
