import { NextResponse } from "next/server";

/** Liveness probe for the prod compose healthcheck (no DB touch). */
export function GET() {
  return NextResponse.json({ ok: true });
}
