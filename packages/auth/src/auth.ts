import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { newUserShortId } from "@mcphosting/core";
import { getDb } from "@mcphosting/db";
import { sendEmail } from "./email.js";

// Verification is enforced only when email delivery is actually configured, so
// local dev (console "emails") works out of the box.
const requireEmailVerification = !!process.env.RESEND_API_KEY;

// Public registration. Set SIGNUPS_ENABLED=false to close it (e.g. private
// beta) — the sign-up endpoint then returns an error; existing users still log in.
export const signupsEnabled = process.env.SIGNUPS_ENABLED !== "false";

/**
 * Single better-auth instance, shared by apps/web (route handler + middleware)
 * and apps/mcp (API-key verification). Email + password is the only login
 * method for now; magic-link and OAuth providers are drop-in additions later.
 */
export const auth = betterAuth({
  appName: "mcphosting",
  secret: process.env.APP_SECRET,
  baseURL: process.env.AUTH_BASE_URL ?? "http://localhost:3000",

  database: drizzleAdapter(getDb(), { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: !signupsEnabled,
    requireEmailVerification,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your mcphosting password",
        text: `Reset your password: ${url}\n\nIf you didn't request this, you can ignore this email.`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your mcphosting email",
        text: `Confirm your address: ${url}`,
      });
    },
  },

  user: {
    additionalFields: {
      // Stable URL-safe suffix appended to every subdomain so site names
      // never collide between users.
      shortId: { type: "string", required: false, input: false, unique: true },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: { ...user, shortId: newUserShortId() } }),
      },
    },
  },

  // apiKey: MCP tokens (hashed at rest, revocable).
  // The plugin's default rate limit is ~10 req/day — far too low for an agent
  // that fires many tool calls in one session, so disable it (the bearer token
  // is already a strong secret; add coarse limiting at the edge later).
  // bearer: lets the MCP server authenticate via the Authorization header.
  plugins: [apiKey({ rateLimit: { enabled: false } }), bearer()],
});

export type Auth = typeof auth;
