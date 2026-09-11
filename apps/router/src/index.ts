import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import {
  type FunctionRoute,
  ProjectService,
  type ResolvedSite,
  matchRoute,
  safeTokenEqual,
  scanFunctionRoutes,
  siteAccessToken,
  verifyPassword,
  verifyPreviewBypass,
} from "@mcphosting/core";
import { getDb } from "@mcphosting/db";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import mime from "mime-types";

const HOP_BY_HOP = new Set(["content-length", "content-encoding", "transfer-encoding", "connection"]);

/** Cookie that proves a visitor entered the site password; verified per request. */
const ACCESS_COOKIE = "mcphosting_access";
/** Endpoint the password gate form posts to (reserved; never served as a file). */
const UNLOCK_PATH = "/__mcphosting/unlock";
/** Endpoint the dashboard links the preview iframe at to bypass the gate (owner only). */
const PREVIEW_ACCESS_PATH = "/__mcphosting/preview-access";

const PORT = Number(process.env.ROUTER_PORT ?? 3002);
const FUNCTIONS_URL = process.env.FUNCTIONS_URL ?? "http://localhost:3003";

const service = new ProjectService(getDb(), {
  mainDomain: process.env.MAIN_DOMAIN,
      baseDomain: process.env.PUBLIC_BASE_DOMAIN ?? process.env.BASE_DOMAIN ?? "lvh.me",
  repoRoot: process.env.REPO_ROOT ?? "./data/repos",
  snapshotRoot: process.env.SNAPSHOT_ROOT ?? "./data/snapshots",
  dataRoot: process.env.JSON_DATA_ROOT ?? "./data/json-db",
  siteScheme: process.env.PUBLIC_SITE_SCHEME,
  sitePort: process.env.PUBLIC_SITE_PORT,
});

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

// Function routes are immutable for published snapshots, so cache them per dir.
// Preview (draft) dirs are rescanned every request since they change on edit.
const routeCache = new Map<string, FunctionRoute[]>();
async function getRoutes(dir: string, isPreview: boolean): Promise<FunctionRoute[]> {
  if (!isPreview && routeCache.has(dir)) return routeCache.get(dir)!;
  const routes = await scanFunctionRoutes(dir);
  if (!isPreview) routeCache.set(dir, routes);
  return routes;
}

/** Resolve a request path to a file inside the served directory (no traversal). */
async function resolveFile(dir: string, urlPath: string): Promise<string | null> {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  let rel = clean.replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  // The functions/ directory holds backend handler source — never served statically.
  if (rel.split("/").some((part) => part.startsWith(".")) || rel === "functions" || rel.startsWith("functions/")) return null;

  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return null;

  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      const indexPath = path.join(abs, "index.html");
      await fs.access(indexPath);
      return indexPath;
    }
    return abs;
  } catch {
    // Try `<path>.html` for clean URLs (e.g. /about -> about.html).
    try {
      const html = abs.endsWith(".html") ? abs : `${abs}.html`;
      await fs.access(html);
      return html;
    } catch {
      return null;
    }
  }
}

/** Forward a matched route to the Deno functions invoker and relay its response. */
async function invokeFunction(
  c: Context,
  site: ResolvedSite,
  file: string,
  params: Record<string, string>,
) {
  if (process.env.FUNCTIONS_ENABLED !== "true") return c.text("Functions are disabled", 503);
  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? Buffer.from(await c.req.arrayBuffer()).toString("base64") : null;
  const env = await service.getEnvMap(site.projectId);
  // Pass an absolute URL so the handler's `new Request(url)` is well-formed.
  const host = c.req.header("host") ?? "localhost";
  const absoluteUrl = new URL(c.req.url, `https://${host}`).toString();

  let resp: Response;
  try {
    resp = await fetch(`${FUNCTIONS_URL}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: site.projectId,
        dir: site.dir,
        file,
        params,
        env,
        method,
        url: absoluteUrl,
        headers: c.req.header(),
        body,
      }),
    });
  } catch {
    return c.text("Function runtime unavailable", 502);
  }

  const out = new Headers();
  resp.headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  });
  out.set("cache-control", "no-store");
  const buf = Buffer.from(await resp.arrayBuffer());
  return c.body(buf, resp.status as 200, Object.fromEntries(out.entries()));
}

/** Whether the request already carries a valid access cookie for this site. */
function hasAccess(c: Context, site: ResolvedSite): boolean {
  if (!site.passwordHash) return true;
  const cookie = getCookie(c, ACCESS_COOKIE);
  if (!cookie) return false;
  return safeTokenEqual(cookie, siteAccessToken(site.projectId, site.passwordHash));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/** Render the password gate. `error` shows after a wrong attempt. */
function gatePage(c: Context, opts: { error?: boolean } = {}) {
  const next = escapeHtml(c.req.path || "/");
  const error = opts.error
    ? `<p style="color:#f87171;font-size:13px;margin:0 0 12px">Wrong password. Try again.</p>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Password required</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0b0d10;color:#e6e8eb">
<form method="POST" action="${UNLOCK_PATH}" style="width:300px;background:#13171c;border:1px solid #1f242b;border-radius:12px;padding:24px">
<h1 style="font-size:17px;margin:0 0 4px">🔒 This site is protected</h1>
<p style="font-size:13px;color:#9aa3ad;margin:0 0 16px">Enter the password to view it.</p>
${error}
<input type="hidden" name="next" value="${next}">
<input type="password" name="password" autofocus required placeholder="Password"
 style="width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid #2a313a;background:#0b0d10;color:#e6e8eb;font-size:14px;margin-bottom:12px">
<button type="submit" style="width:100%;padding:9px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Unlock</button>
</form></body></html>`;
  return c.html(html, 401);
}

/** Set the gate cookie (the same token `hasAccess` later verifies). */
function grantAccess(c: Context, site: ResolvedSite) {
  if (!site.passwordHash) return;
  const secure = (c.req.header("x-forwarded-proto") ?? "").includes("https");
  setCookie(c, ACCESS_COOKIE, siteAccessToken(site.projectId, site.passwordHash), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** A safe in-site redirect target taken from untrusted input. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !next.startsWith("/__mcphosting/") ? next : "/";
}

/** Verify a submitted password and, on success, set the access cookie. */
async function handleUnlock(c: Context, site: ResolvedSite) {
  if (!site.passwordHash) return c.redirect("/", 303);
  const form = await c.req.formData();
  const password = String(form.get("password") ?? "");
  const dest = safeNext(String(form.get("next") ?? "/"));

  if (!verifyPassword(password, site.passwordHash)) {
    return gatePage(c, { error: true });
  }

  grantAccess(c, site);
  return c.redirect(dest, 303);
}

/**
 * Owner preview bypass: the dashboard points the preview iframe here with a
 * signed token. Valid only on preview hosts, so production always stays behind
 * the password even with a leaked token.
 */
function handlePreviewAccess(c: Context, site: ResolvedSite) {
  const dest = safeNext(c.req.query("next") ?? "/");
  if (!site.passwordHash) return c.redirect(dest, 303);

  const token = c.req.query("token") ?? "";
  if (!site.isPreview || !verifyPreviewBypass(site.projectId, token)) {
    return gatePage(c);
  }

  grantAccess(c, site);
  return c.redirect(dest, 303);
}

app.all("*", async (c) => {
  const host = c.req.header("host") ?? "";
  const site = await service.resolveSite(host);

  if (!site) return c.text("Site not found", 404);

  // Password gate: applies even to unpublished/preview so a protected site is
  // never viewable without the password, whatever its publish state.
  if (site.passwordHash) {
    if (c.req.method === "POST" && c.req.path === UNLOCK_PATH) {
      return handleUnlock(c, site);
    }
    if (c.req.path === PREVIEW_ACCESS_PATH) {
      return handlePreviewAccess(c, site);
    }
    if (!hasAccess(c, site)) return gatePage(c);
  }

  if (site.unpublished) {
    return c.html(
      "<h1>Not published yet</h1><p>Publish this project to make it live.</p>",
      404,
    );
  }

  const file = await resolveFile(site.dir, c.req.path);
  if (!file) {
    // No static file — maybe it's a backend function route.
    const routes = await getRoutes(site.dir, site.isPreview);
    const match = matchRoute(routes, c.req.path);
    if (match) return invokeFunction(c, site, match.file, match.params);

    const notFound = await resolveFile(site.dir, "/404.html");
    if (notFound) {
      const body = await fs.readFile(notFound);
      return c.body(body, 404, { "content-type": "text/html; charset=utf-8" });
    }
    return c.text("Not found", 404);
  }

  const body = await fs.readFile(file);
  const type = mime.lookup(file) || "application/octet-stream";
  const charset = mime.charset(type);
  return c.body(body, 200, {
    "content-type": charset ? `${type}; charset=${charset.toLowerCase()}` : type,
    // Preview must never be cached; production snapshots are immutable.
    "cache-control": site.isPreview ? "no-store" : "public, max-age=60",
  });
});

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`[mcphosting/router] serving sites on :${info.port}`);
});
