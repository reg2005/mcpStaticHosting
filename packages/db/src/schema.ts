import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// better-auth owns identity: user / session / account / verification / apikey.
// (apikey = MCP tokens.) Re-exported so the drizzle client and migrations see them.
export * from "./auth-schema";

/**
 * mcphosting domain model.
 *
 * Postgres stores only metadata. The actual site files live in a per-project
 * git repository on disk (see @mcphosting/core). A "release" is a git commit that
 * production points at; the draft branch is what preview serves.
 */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Human-chosen (or random) site name; combined with user.shortId for the host. */
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  /** Absolute/relative path of the git repo on disk. */
  repoPath: text("repo_path").notNull(),
  /** The release currently served on the production subdomain (null = never published). */
  productionReleaseId: uuid("production_release_id"),
  /**
   * When set, the site is password-protected: visitors must enter the password
   * before the router serves any page. Stored as a salted scrypt hash, never
   * plaintext. Null = publicly viewable.
   */
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** Monotonic per-project version number (1, 2, 3, ...). */
  version: integer("version").notNull(),
  /** Git commit SHA this release snapshots. */
  gitCommit: text("git_commit").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domainType = pgEnum("domain_type", ["subdomain", "custom"]);
export const tlsStatus = pgEnum("tls_status", ["pending", "active", "failed"]);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    type: domainType("type").notNull(),
    /** Whether this host serves production (false) or preview/draft (true). */
    isPreview: boolean("is_preview").notNull().default(false),
    /** Custom domains must be DNS-verified before they go live. */
    verified: boolean("verified").notNull().default(false),
    verificationToken: text("verification_token"),
    tls: tlsStatus("tls").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hostnameIdx: uniqueIndex("domains_hostname_idx").on(t.hostname),
  }),
);

/** Per-project secrets injected into backend functions as ctx.env (encrypted at rest). */
export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectKeyIdx: uniqueIndex("env_vars_project_key_idx").on(t.projectId, t.key),
  }),
);

export type User = typeof user.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type EnvVar = typeof envVars.$inferSelect;
