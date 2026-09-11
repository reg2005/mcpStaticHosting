import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: redirect to /login when no session cookie is present.
 * Server components/route handlers still verify the session for real. Enforced
 * only in production so the local dev-user fallback keeps the dashboard usable.
 */
export function middleware(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
