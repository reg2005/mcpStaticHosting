import { randomUUID } from "node:crypto";
import { and, count, desc, eq, max } from "drizzle-orm";
import { type Db, domains, envVars, projects, releases, user } from "@mcphosting/db";
import { decryptSecret, encryptSecret, hashPassword } from "./crypto.js";
import { GitStore } from "./git-store.js";
import { isValidSlug, newRandomSlug, newUserShortId, slugify } from "./ids.js";
import { JsonDataStore } from "./json-data-store.js";
import {
  isReservedHost,
  isValidHostname,
  normalizeHostname,
  previewHost,
  productionHost,
} from "./hostnames.js";

/**
 * Custom domains per account on the basic tier. First-come-first-served: the
 * unique index on domains.hostname means whoever claims a host owns it. When
 * paid tiers land this becomes a per-plan limit.
 */
export const MAX_CUSTOM_DOMAINS_PER_USER = 40;

export interface ProjectServiceConfig {
  baseDomain: string;
  repoRoot: string;
  snapshotRoot: string;
  dataRoot?: string;
  /** Scheme for served-site URLs. Defaults to "https"; use "http" for local dev. */
  siteScheme?: string;
  /** Port for served-site URLs (local dev only; the router's port). Omit in prod. */
  sitePort?: string | number;
}

export interface ProjectUrls {
  productionUrl: string;
  previewUrl: string;
}

export interface ResolvedSite {
  projectId: string;
  dir: string;
  isPreview: boolean;
  /** True for production hosts that have never been published. */
  unpublished: boolean;
  /** Salted hash of the site password, or null when the site is public. */
  passwordHash: string | null;
}

export class ProjectService {
  readonly git: GitStore;
  readonly data: JsonDataStore;

  constructor(
    private readonly db: Db,
    private readonly config: ProjectServiceConfig,
  ) {
    this.git = new GitStore({ repoRoot: config.repoRoot, snapshotRoot: config.snapshotRoot });
    this.data = new JsonDataStore(config.dataRoot ?? "./data/json-db");
  }

  /** Load a user by id. Authentication itself happens in the app layer (which
   * owns @mcphosting/auth) to avoid an auth→core→auth dependency cycle. */
  async getUserById(id: string) {
    const [found] = await this.db.select().from(user).where(eq(user.id, id)).limit(1);
    return found ?? null;
  }

  /**
   * Dev-only: ensure a local user exists so the dashboard is usable before the
   * login/sign-up UI lands. Inserts directly into the better-auth `user` table
   * (no password) — never call this in production.
   */
  async ensureDevUser(email: string, name?: string) {
    const [existing] = await this.db.select().from(user).where(eq(user.email, email)).limit(1);
    if (existing) return existing;
    const now = new Date();
    const [created] = await this.db
      .insert(user)
      .values({
        id: randomUUID(),
        email,
        name: name ?? email,
        emailVerified: true,
        shortId: newUserShortId(),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Failed to create dev user");
    return created;
  }

  hostsFor(slug: string, userShortId: string): ProjectUrls {
    const parts = { slug, userShortId };
    const scheme = this.config.siteScheme ?? "https";
    const port = this.config.sitePort ? `:${this.config.sitePort}` : "";
    return {
      productionUrl: `${scheme}://${productionHost(parts, this.config.baseDomain)}${port}`,
      previewUrl: `${scheme}://${previewHost(parts, this.config.baseDomain)}${port}`,
    };
  }

  async createProject(userId: string, name?: string) {
    const owner = await this.getUserById(userId);
    if (!owner) throw new Error("User not found");
    if (!owner.shortId) throw new Error("User is missing a shortId");

    let slug = name ? slugify(name) : newRandomSlug();
    if (!isValidSlug(slug)) slug = newRandomSlug();

    // Disambiguate within this user's namespace.
    const existing = await this.db
      .select({ slug: projects.slug })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
      .limit(1);
    if (existing.length > 0) slug = `${slug}-${newRandomSlug().slice(0, 4)}`;

    const [project] = await this.db
      .insert(projects)
      .values({ userId, slug, name: name ?? slug, repoPath: "" })
      .returning();
    if (!project) throw new Error("Failed to create project");

    const repoPath = this.git.repoDir(project.id);
    await this.db.update(projects).set({ repoPath }).where(eq(projects.id, project.id));
    await this.git.ensureProject(project.id);

    const urls = this.hostsFor(slug, owner.shortId);
    await this.db.insert(domains).values([
      {
        projectId: project.id,
        hostname: new URL(urls.productionUrl).hostname,
        type: "subdomain",
        isPreview: false,
        verified: true,
        tls: "active",
      },
      {
        projectId: project.id,
        hostname: new URL(urls.previewUrl).hostname,
        type: "subdomain",
        isPreview: true,
        verified: true,
        tls: "active",
      },
    ]);

    return { project, ...urls };
  }

  async listProjects(userId: string) {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  /** Look up a project by id OR slug (scoped to the user). */
  async getProject(userId: string, ref: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
    const match = isUuid ? eq(projects.id, ref) : eq(projects.slug, ref);
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(match, eq(projects.userId, userId)))
      .limit(1);
    return project ?? null;
  }

  /** Resolve a project ref (id or slug) to its canonical row, or throw a clean error. */
  async requireProject(userId: string, ref: string) {
    const project = await this.getProject(userId, ref);
    if (!project) throw new Error(`Project not found: ${ref}`);
    return project;
  }

  /** Delete a project entirely (db rows cascade; git repo + snapshots removed). */
  async deleteProject(userId: string, ref: string) {
    const project = await this.requireProject(userId, ref);
    await this.db.delete(projects).where(eq(projects.id, project.id));
    await this.git.remove(project.id);
    return { id: project.id, slug: project.slug };
  }

  /** Rename a project's display name. The slug (and its URLs) are left unchanged. */
  async renameProject(userId: string, ref: string, name: string) {
    const project = await this.requireProject(userId, ref);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name cannot be empty");
    const [updated] = await this.db
      .update(projects)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();
    return updated ?? project;
  }

  /** Publish the draft as the next release and point production at it. */
  async publish(userId: string, ref: string, message = "") {
    const project = await this.requireProject(userId, ref);

    const [{ value: latest } = { value: 0 }] = await this.db
      .select({ value: max(releases.version) })
      .from(releases)
      .where(eq(releases.projectId, project.id));
    const version = (latest ?? 0) + 1;

    const { commit } = await this.git.publish(project.id, version, message);

    const [release] = await this.db
      .insert(releases)
      .values({ projectId: project.id, version, gitCommit: commit, message: message || null })
      .returning();
    if (!release) throw new Error("Failed to record release");

    await this.db
      .update(projects)
      .set({ productionReleaseId: release.id, updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    return release;
  }

  /** List a project's releases, newest first. */
  async listReleases(userId: string, ref: string) {
    const project = await this.requireProject(userId, ref);
    return this.db
      .select({ version: releases.version, message: releases.message, createdAt: releases.createdAt })
      .from(releases)
      .where(eq(releases.projectId, project.id))
      .orderBy(desc(releases.version));
  }

  /** Repoint production at an earlier release (rollback). */
  async rollback(userId: string, ref: string, version: number) {
    const project = await this.requireProject(userId, ref);
    const [release] = await this.db
      .select()
      .from(releases)
      .where(and(eq(releases.projectId, project.id), eq(releases.version, version)))
      .limit(1);
    if (!release) throw new Error(`Release v${version} not found`);
    await this.db
      .update(projects)
      .set({ productionReleaseId: release.id, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
    return release;
  }

  // --- Backend-function secrets (ctx.env) ---

  async setEnv(userId: string, ref: string, envKey: string, value: string) {
    const project = await this.requireProject(userId, ref);
    const valueEncrypted = encryptSecret(value);
    await this.db
      .insert(envVars)
      .values({ projectId: project.id, key: envKey, valueEncrypted })
      .onConflictDoUpdate({
        target: [envVars.projectId, envVars.key],
        set: { valueEncrypted, updatedAt: new Date() },
      });
  }

  /** List secret keys for a project (values are never returned to clients). */
  async listEnv(userId: string, ref: string) {
    const project = await this.requireProject(userId, ref);
    return this.db
      .select({ key: envVars.key, updatedAt: envVars.updatedAt })
      .from(envVars)
      .where(eq(envVars.projectId, project.id));
  }

  async deleteEnv(userId: string, ref: string, envKey: string) {
    const project = await this.requireProject(userId, ref);
    await this.db
      .delete(envVars)
      .where(and(eq(envVars.projectId, project.id), eq(envVars.key, envKey)));
  }

  /** Decrypted env map for the functions runtime (internal — no ownership check). */
  async getEnvMap(projectId: string): Promise<Record<string, string>> {
    const rows = await this.db
      .select()
      .from(envVars)
      .where(eq(envVars.projectId, projectId));
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = decryptSecret(row.valueEncrypted);
    return out;
  }

  // --- Custom domains (white-label) ---

  /** Custom domains attached to a project (managed subdomains are not listed). */
  async listDomains(userId: string, ref: string) {
    const project = await this.requireProject(userId, ref);
    return this.db
      .select({
        hostname: domains.hostname,
        verified: domains.verified,
        tls: domains.tls,
        createdAt: domains.createdAt,
      })
      .from(domains)
      .where(and(eq(domains.projectId, project.id), eq(domains.type, "custom")))
      .orderBy(desc(domains.createdAt));
  }

  /** Count custom domains across all of a user's projects (for the tier limit). */
  private async countUserDomains(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(domains)
      .innerJoin(projects, eq(domains.projectId, projects.id))
      .where(and(eq(projects.userId, userId), eq(domains.type, "custom")));
    return row?.n ?? 0;
  }

  /**
   * Attach a custom domain to a project. Verification is claim-based: the first
   * account to add a hostname owns it (enforced by the unique index on
   * domains.hostname). The owner points DNS at the platform and Caddy issues a
   * cert on demand once the router confirms we serve the host.
   */
  async addDomain(userId: string, ref: string, hostnameInput: string) {
    const project = await this.requireProject(userId, ref);
    const hostname = normalizeHostname(hostnameInput);
    if (!isValidHostname(hostname)) {
      throw new Error(`Invalid domain: ${hostnameInput}`);
    }
    if (isReservedHost(hostname, this.config.baseDomain)) {
      throw new Error(
        `${hostname} is managed by the platform and can't be added as a custom domain`,
      );
    }

    const used = await this.countUserDomains(userId);
    if (used >= MAX_CUSTOM_DOMAINS_PER_USER) {
      throw new Error(
        `Domain limit reached (${MAX_CUSTOM_DOMAINS_PER_USER}). Remove one or upgrade your plan.`,
      );
    }

    try {
      const [domain] = await this.db
        .insert(domains)
        .values({
          projectId: project.id,
          hostname,
          type: "custom",
          isPreview: false,
          // Claim-based: the row's existence is the verification.
          verified: true,
          // Caddy issues the certificate on the first request to the host.
          tls: "pending",
        })
        .returning();
      if (!domain) throw new Error("Failed to add domain");
      return { hostname: domain.hostname, verified: domain.verified, tls: domain.tls };
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error(`${hostname} is already claimed`);
      throw err;
    }
  }

  /** Detach a custom domain from a project. */
  async removeDomain(userId: string, ref: string, hostnameInput: string) {
    const project = await this.requireProject(userId, ref);
    const hostname = normalizeHostname(hostnameInput);
    const deleted = await this.db
      .delete(domains)
      .where(
        and(
          eq(domains.projectId, project.id),
          eq(domains.hostname, hostname),
          eq(domains.type, "custom"),
        ),
      )
      .returning({ hostname: domains.hostname });
    if (deleted.length === 0) throw new Error(`Domain not found: ${hostname}`);
    return { hostname };
  }

  // --- Site password protection ---

  /** Set (or change) the password that gates public access to a site. */
  async setPassword(userId: string, ref: string, password: string) {
    if (!password) throw new Error("Password must not be empty");
    const project = await this.requireProject(userId, ref);
    await this.db
      .update(projects)
      .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  }

  /** Remove the password so the site is publicly viewable again. */
  async removePassword(userId: string, ref: string) {
    const project = await this.requireProject(userId, ref);
    await this.db
      .update(projects)
      .set({ passwordHash: null, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  }

  /** Whether a site is currently password-protected (no hash leaked). */
  async isPasswordProtected(userId: string, ref: string): Promise<boolean> {
    const project = await this.requireProject(userId, ref);
    return project.passwordHash !== null;
  }

  /**
   * Resolve an incoming site request (used by the router). Handles both mcphosting
   * subdomains and verified custom domains via the domains table.
   */
  async resolveSite(hostname: string): Promise<ResolvedSite | null> {
    const host = hostname.toLowerCase().split(":")[0] ?? "";
    const [domain] = await this.db
      .select()
      .from(domains)
      .where(eq(domains.hostname, host))
      .limit(1);
    if (!domain || !domain.verified) return null;

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, domain.projectId))
      .limit(1);
    if (!project) return null;

    const passwordHash = project.passwordHash ?? null;

    if (domain.isPreview) {
      return {
        projectId: project.id,
        dir: this.git.previewDir(project.id),
        isPreview: true,
        unpublished: false,
        passwordHash,
      };
    }

    if (!project.productionReleaseId) {
      return { projectId: project.id, dir: "", isPreview: false, unpublished: true, passwordHash };
    }
    const [release] = await this.db
      .select()
      .from(releases)
      .where(eq(releases.id, project.productionReleaseId))
      .limit(1);
    if (!release)
      return { projectId: project.id, dir: "", isPreview: false, unpublished: true, passwordHash };

    return {
      projectId: project.id,
      dir: this.git.snapshotDir(project.id, release.version),
      isPreview: false,
      unpublished: false,
      passwordHash,
    };
  }
}

/** Postgres unique-constraint violation (e.g. a hostname already claimed). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "23505"
  );
}
