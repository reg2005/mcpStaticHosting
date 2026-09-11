import { NextResponse, type NextRequest } from "next/server";

/** Fast cookie-presence gate; handlers verify the real session in PostgreSQL. */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Sibling hosted sites share the registrable domain but must not mutate the dashboard.
    const origin = req.headers.get("origin");
    const expected = process.env.AUTH_BASE_URL ?? "http://localhost:3000";
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && origin !== expected) {
      return NextResponse.json({ code: "ORIGIN_NOT_ALLOWED", message: "Запрос с этого сайта запрещён." }, { status: 403 });
    }
    return NextResponse.next();
  }
  if (req.cookies.has("__Host-mcphosting.session_token") || req.cookies.has("mcphosting.session_token")) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
