import { NextResponse } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getRouterAccessMode } from "@/lib/router-access";

export async function GET(req: Request) {
  try {
    await getAuthContextFromRequest(req);
    return NextResponse.json(getRouterAccessMode());
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
