/**
 * Subdomain scheme:
 *   production: <slug>-<userShortId>.<baseDomain>
 *   preview:    <slug>-<userShortId>.preview.<baseDomain>
 *
 * The userShortId suffix is mandatory so site names never collide between users.
 */

export interface HostParts {
  slug: string;
  userShortId: string;
}

export function productionHost(parts: HostParts, baseDomain: string): string {
  return `${parts.slug}-${parts.userShortId}.${baseDomain}`;
}

export function previewHost(parts: HostParts, baseDomain: string): string {
  return `${parts.slug}-${parts.userShortId}.preview.${baseDomain}`;
}

export interface ResolvedHost {
  slug: string;
  userShortId: string;
  isPreview: boolean;
}

/**
 * Parse a mcphosting subdomain back into its parts. Returns null for hostnames that
 * don't match the scheme (e.g. custom domains — those are resolved via the DB).
 */
export function parsemcphostingHost(hostname: string, baseDomain: string): ResolvedHost | null {
  const host = hostname.toLowerCase().split(":")[0] ?? "";
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const sub = host.slice(0, -1 * (baseDomain.length + 1));
  const labels = sub.split(".");

  let isPreview = false;
  let label: string | undefined;

  if (labels.length === 1) {
    label = labels[0];
  } else if (labels.length === 2 && labels[1] === "preview") {
    isPreview = true;
    label = labels[0];
  } else {
    return null;
  }

  if (!label) return null;
  const dash = label.lastIndexOf("-");
  if (dash <= 0) return null;

  const slug = label.slice(0, dash);
  const userShortId = label.slice(dash + 1);
  if (!slug || !userShortId) return null;

  return { slug, userShortId, isPreview };
}

/**
 * Strip protocol, port, path and trailing dot from arbitrary user input and
 * lowercase it, yielding a bare hostname suitable for the domains table.
 */
export function normalizeHostname(input: string): string {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, ""); // protocol
  host = host.split("/")[0] ?? ""; // path
  host = host.split(":")[0] ?? ""; // port
  host = host.replace(/\.$/, ""); // trailing dot
  return host;
}

// A real DNS name: at least two labels and a 2+ char alphabetic TLD (so bare
// words like "localhost" are rejected). Each label is 1–63 chars, no leading
// or trailing hyphen; the whole name is at most 253 chars.
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidHostname(host: string): boolean {
  return HOSTNAME_RE.test(host);
}

/**
 * Whether a hostname falls under the platform's own base domain (its
 * subdomains and the apex). Those are managed automatically and can never be
 * claimed as a custom domain.
 */
export function isReservedHost(host: string, baseDomain: string): boolean {
  const base = baseDomain.toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}
