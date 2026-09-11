import "server-only";
import { headers } from "next/headers";
import { auth } from "@mcphosting/auth";
import type { User } from "@mcphosting/db";
import { getService } from "./service";

/**
 * Resolve the current user from the authenticated Better Auth session.
 */


export async function getCurrentUser(): Promise<User> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const user = await getService().getUserById(session.user.id);
    if (user) return user;
  }
  throw new Error("Not authenticated");
}

/**
 * Resolve the current user from a real session only — no dev fallback. Returns
 * null when nobody is signed in. Use on public pages (e.g. the landing page)
 * that render differently for authenticated visitors.
 */
export async function getOptionalUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const user = await getService().getUserById(session.user.id);
    if (user) return user;
  }
  return null;
}
