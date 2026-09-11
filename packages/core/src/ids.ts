import { customAlphabet } from "nanoid";

// URL-safe, lowercase, no ambiguous characters.
const alphabet = "23456789abcdefghijkmnpqrstuvwxyz";

/** Short stable suffix appended to every subdomain (derived once per user). */
export const newUserShortId = customAlphabet(alphabet, 8);

/** Random site slug used when the user doesn't pick a name. */
export const newRandomSlug = customAlphabet(alphabet, 10);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normalize a user-supplied name into a DNS-safe slug. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug || newRandomSlug();
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
