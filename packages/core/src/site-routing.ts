import type { HostParts } from "./hostnames.js";

export type RoutingMode = "subdomain" | "path";

export function readRoutingMode(value?: string): RoutingMode {
  if (value === undefined || value === "" || value === "subdomain") return "subdomain";
  if (value === "path") return "path";
  throw new Error("SITE_ROUTING_MODE должен быть subdomain или path");
}

export function systemPath(parts: HostParts, isPreview = false): string {
  return `/${isPreview ? "preview" : "sites"}/${parts.slug}-${parts.userShortId}/`;
}

function safePath(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path);
    return !/[\\\x00-\x1f]/.test(decoded) && !decoded.split("/").some((part) => part === "." || part === "..");
  } catch { return false; }
}

/** Parse only canonical system namespaces; never interpret arbitrary paths as projects. */
export function parseSystemPath(path: string) {
  const match = /^\/(sites|preview)\/([a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{8})(\/.*)?$/.exec(path);
  if (!match || !safePath(path)) return null;
  const label = match[2]!;
  return { label, isPreview: match[1] === "preview", basePath: `/${match[1]}/${label}/`, sitePath: match[3] ?? "/", needsSlash: !match[3] };
}

/** Redirects are relative to a site's root, including its mount path. */
export function inSiteRedirect(next: string, basePath = "/"): string {
  if (!next.startsWith("/") || next.startsWith("//") || !safePath(next.split("?")[0]!) || next.startsWith("/__mcphosting/")) return basePath;
  return basePath + next.slice(1);
}

// Without allow-same-origin, project scripts cannot read management pages, cookies,
// storage or register service workers on the shared management origin.
export const PATH_SITE_CSP = "sandbox allow-scripts allow-forms allow-popups allow-downloads; object-src 'none'; frame-ancestors 'self'";
