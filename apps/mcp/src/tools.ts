import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DomainError, leadTemplateFiles, type ProjectService } from "@mcphosting/core";
import type { User } from "@mcphosting/db";
import { Redis } from "ioredis";
import { z } from "zod";

const BACKEND_FUNCTIONS_GUIDE = `Backend functions live inside a project's functions/ directory.

Routing:
- functions/api/hello.ts -> /api/hello
- functions/api/index.ts -> /api
- functions/api/[id].ts -> /api/:id, available as ctx.params.id

Handler shape:
export default async function handler(req: Request, ctx: McpHostingFunctionCtx): Promise<Response> {
  return Response.json({ ok: true });
}

Context:
- ctx.env: per-project secrets configured with set_env/list_env/delete_env
- ctx.params: dynamic route params
- ctx.kv: Redis-backed KV with get/set/del/incr
- ctx.data: local JSON-file database with insert/list/get

Simple request flow:
1. Create functions/api/lead.ts.
2. Validate req.json().
3. Return 422 with { ok: false, errors } for validation failures.
4. Save accepted data with ctx.data.insert("leads", payload, meta).
5. Optionally forward to an external webhook from ctx.env.LEAD_WEBHOOK_URL.
6. Return { ok: true, id }.

Use install_lead_template for a ready-to-edit example. Use list_data_collections
and list_data_records to inspect submissions saved by ctx.data.`;

let redis: Redis | undefined;
function getRedis(): Redis {
  if (!redis) redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  return redis;
}

/** Build an MCP server whose tools are scoped to one authenticated user. */
export function buildServer(service: ProjectService, user: User): McpServer {
  const server = new McpServer({ name: "mcphosting", version: "0.2.0" });

  const json = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  server.tool(
    "create_project",
    "Create a new site. Returns its id plus production and preview URLs.",
    { name: z.string().optional().describe("Optional site name; random if omitted") },
    async ({ name }) => {
      const { project, productionUrl, previewUrl } = await service.createProject(user.id, name);
      return json({ id: project.id, slug: project.slug, productionUrl, previewUrl });
    },
  );

  server.tool("list_projects", "List all of your sites.", {}, async () => {
    const list = await service.listProjects(user.id);
    return json(list.map((p) => ({ id: p.id, slug: p.slug, name: p.name })));
  });

  server.tool(
    "list_files",
    "List all files in a project's current draft.",
    { project: z.string().describe("Project id or slug") },
    async ({ project }) => {
      const p = await mustOwn(service, user.id, project);
      return json(await service.git.listFiles(p.id));
    },
  );

  server.tool(
    "read_file",
    "Read a file from the current draft.",
    { project: z.string(), path: z.string() },
    async ({ project, path }) => {
      const p = await mustOwn(service, user.id, project);
      return { content: [{ type: "text", text: await service.git.readFile(p.id, path) }] };
    },
  );

  server.tool(
    "write_file",
    "Create or overwrite a single file in the draft. Set encoding=base64 for binary assets.",
    {
      project: z.string(),
      path: z.string(),
      content: z.string(),
      encoding: z.enum(["utf8", "base64"]).optional(),
      message: z.string().optional(),
    },
    async ({ project, path, content, encoding, message }) => {
      const p = await mustOwn(service, user.id, project);
      const commit = await service.git.writeFiles(
        p.id,
        [{ path, content, encoding }],
        message ?? `Update ${path}`,
      );
      return json({ ok: true, commit });
    },
  );

  server.tool(
    "write_files",
    "Create or overwrite multiple files in one atomic commit (fewer round-trips than write_file).",
    {
      project: z.string(),
      files: z
        .array(
          z.object({
            path: z.string(),
            content: z.string(),
            encoding: z.enum(["utf8", "base64"]).optional(),
          }),
        )
        .min(1),
      message: z.string().optional(),
    },
    async ({ project, files, message }) => {
      const p = await mustOwn(service, user.id, project);
      const commit = await service.git.writeFiles(p.id, files, message ?? `Update ${files.length} files`);
      return json({ ok: true, commit, written: files.length });
    },
  );

  server.tool(
    "delete_file",
    "Delete a file from the draft.",
    { project: z.string(), path: z.string() },
    async ({ project, path }) => {
      const p = await mustOwn(service, user.id, project);
      const commit = await service.git.deleteFile(p.id, path);
      return json({ ok: true, commit });
    },
  );

  server.tool(
    "rename_file",
    "Rename or move a file within the draft.",
    { project: z.string(), from: z.string(), to: z.string() },
    async ({ project, from, to }) => {
      const p = await mustOwn(service, user.id, project);
      const commit = await service.git.renameFile(p.id, from, to);
      return json({ ok: true, commit });
    },
  );

  server.tool(
    "delete_project",
    "Permanently delete a project (files, releases, domains, and secrets).",
    { project: z.string() },
    async ({ project }) => json(await service.deleteProject(user.id, project)),
  );

  server.tool(
    "publish",
    "Publish the current draft as a new release and point production at it.",
    { project: z.string(), message: z.string().optional() },
    async ({ project, message }) => {
      const release = await service.publish(user.id, project, message ?? "");
      return json({ ok: true, version: release.version, commit: release.gitCommit });
    },
  );

  server.tool(
    "list_versions",
    "List a project's published releases (newest first).",
    { project: z.string() },
    async ({ project }) => json(await service.listReleases(user.id, project)),
  );

  server.tool(
    "rollback",
    "Point production back at an earlier release version.",
    { project: z.string(), version: z.number().int().positive() },
    async ({ project, version }) => {
      const release = await service.rollback(user.id, project, version);
      return json({ ok: true, version: release.version });
    },
  );

  server.tool(
    "get_urls",
    "Get the production and preview URLs for a project.",
    { project: z.string() },
    async ({ project }) => {
      const p = await mustOwn(service, user.id, project);
      return json(service.hostsFor(p.slug, user.shortId));
    },
  );

  // --- Site password protection ---

  server.tool(
    "set_password",
    "Password-protect a site. Visitors must enter this password before any page is served (applies to both preview and production).",
    { project: z.string(), password: z.string().min(1).describe("The password visitors must enter") },
    async ({ project, password }) => {
      await service.setPassword(user.id, project, password);
      return json({ ok: true, protected: true });
    },
  );

  server.tool(
    "remove_password",
    "Remove a site's password so it is publicly viewable again.",
    { project: z.string() },
    async ({ project }) => {
      await service.removePassword(user.id, project);
      return json({ ok: true, protected: false });
    },
  );

  server.tool(
    "password_status",
    "Check whether a site is currently password-protected.",
    { project: z.string() },
    async ({ project }) => json({ protected: await service.isPasswordProtected(user.id, project) }),
  );

  // --- Custom domains (white-label) ---

  server.tool(
    "add_domain",
    "Attach a custom domain outside MAIN_DOMAIN. Returns the instance IPv4 for an A record. DNS verification and HTTP-01 HTTPS issuance are automatic; up to 40 domains per account.",
    { project: z.string(), hostname: z.string().describe("e.g. www.example.com") },
    async ({ project, hostname }) => {
      const p = await mustOwn(service, user.id, project);
      try {
        const domain = await service.addDomain(user.id, p.id, hostname);
        return json({ ok: true, domain, setup: await service.domainSetup(domain.hostname) });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        return { ...json({ code: "VALIDATION_ERROR", message: "Проверьте заполнение полей", errors: [{ field: error.field, message: error.message, rule: error.code }] }), isError: true };
      }
    },
  );

  server.tool(
    "custom_domain_guide",
    "Return user-facing DNS instructions for connecting a custom domain to a project.",
    { project: z.string(), hostname: z.string().describe("e.g. www.example.com") },
    async ({ project, hostname }) => {
      const p = await mustOwn(service, user.id, project);
      return json(await service.domainSetup(hostname));
    },
  );

  server.tool(
    "list_domains",
    "List the custom domains attached to a project.",
    { project: z.string() },
    async ({ project }) => json(await service.listDomains(user.id, project)),
  );

  server.tool(
    "remove_domain",
    "Detach a custom domain from a project (frees it for others to claim).",
    { project: z.string(), hostname: z.string() },
    async ({ project, hostname }) => json(await service.removeDomain(user.id, project, hostname)),
  );

  server.tool(
    "set_system_domain",
    "Enable or disable both automatically assigned system addresses (production and preview). Custom domains remain available.",
    { project: z.string(), enabled: z.boolean() },
    async ({ project, enabled }) => json(await service.setSystemDomain(user.id, project, enabled)),
  );

  // --- Backend functions: secrets + logs ---

  server.tool(
    "backend_functions_guide",
    "Explain how to create and operate project backend functions, including routing, ctx.env, ctx.kv, ctx.data and validation patterns.",
    {},
    async () => ({ content: [{ type: "text", text: BACKEND_FUNCTIONS_GUIDE }] }),
  );

  server.tool(
    "install_lead_template",
    "Install a ready local backend example: functions/api/lead.ts plus an optional index.html form. The function validates input, saves accepted submissions to ctx.data collection 'leads', and can forward to ctx.env.LEAD_WEBHOOK_URL.",
    {
      project: z.string(),
      includeForm: z.boolean().optional().describe("Also write index.html form; defaults to true"),
      overwrite: z.boolean().optional().describe("Overwrite existing template files; defaults to false"),
    },
    async ({ project, includeForm = true, overwrite = false }) => {
      const p = await mustOwn(service, user.id, project);
      const wanted = leadTemplateFiles(includeForm);
      const existing = new Set(await service.git.listFiles(p.id));
      const files = wanted.filter((file) => overwrite || !existing.has(file.path));
      if (files.length > 0) {
        await service.git.writeFiles(p.id, files, "Add local backend lead template");
      }
      return json({
        ok: true,
        added: files.map((file) => file.path),
        skipped: wanted.filter((file) => !files.includes(file)).map((file) => file.path),
      });
    },
  );

  server.tool(
    "set_env",
    "Set a secret (ctx.env) for a project's backend functions.",
    { project: z.string(), key: z.string(), value: z.string() },
    async ({ project, key, value }) => {
      await service.setEnv(user.id, project, key, value);
      return json({ ok: true });
    },
  );

  server.tool(
    "list_env",
    "List secret keys for a project (values are never returned).",
    { project: z.string() },
    async ({ project }) => json(await service.listEnv(user.id, project)),
  );

  server.tool(
    "delete_env",
    "Delete a secret from a project.",
    { project: z.string(), key: z.string() },
    async ({ project, key }) => {
      await service.deleteEnv(user.id, project, key);
      return json({ ok: true });
    },
  );

  server.tool(
    "logs",
    "Recent backend-function logs for a project (most recent first).",
    { project: z.string(), limit: z.number().int().positive().max(200).optional() },
    async ({ project, limit }) => {
      const p = await mustOwn(service, user.id, project);
      const raw = await getRedis().lrange(`fnlog:${p.id}`, 0, (limit ?? 50) - 1);
      return json(raw.map((r) => JSON.parse(r)));
    },
  );

  server.tool(
    "list_data_collections",
    "List local JSON database collections created by ctx.data for a project.",
    { project: z.string() },
    async ({ project }) => {
      const p = await mustOwn(service, user.id, project);
      return json(await service.data.listCollections(p.id));
    },
  );

  server.tool(
    "list_data_records",
    "List records from one ctx.data JSON collection, newest first.",
    {
      project: z.string(),
      collection: z.string().describe("Collection name, e.g. leads"),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
    },
    async ({ project, collection, limit, offset }) => {
      const p = await mustOwn(service, user.id, project);
      return json(await service.data.listRecords(p.id, collection, { limit, offset }));
    },
  );

  server.tool(
    "update_data_record",
    "Update workflow status and/or note on a ctx.data JSON record.",
    {
      project: z.string(),
      collection: z.string(),
      id: z.string(),
      status: z.enum(["new", "processing", "done", "rejected"]).optional(),
      note: z.string().optional(),
    },
    async ({ project, collection, id, status, note }) => {
      const p = await mustOwn(service, user.id, project);
      const patch: { status?: "new" | "processing" | "done" | "rejected"; note?: string } = {};
      if (status) patch.status = status;
      if (note !== undefined) patch.note = note;
      return json(await service.data.updateRecord(p.id, collection, id, patch));
    },
  );

  server.tool(
    "delete_data_record",
    "Delete one record from a ctx.data JSON collection.",
    { project: z.string(), collection: z.string(), id: z.string() },
    async ({ project, collection, id }) => {
      const p = await mustOwn(service, user.id, project);
      const remaining = await service.data.deleteRecord(p.id, collection, id);
      return json({ ok: true, remaining });
    },
  );

  return server;
}

async function mustOwn(service: ProjectService, userId: string, projectId: string) {
  const project = await service.getProject(userId, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}
