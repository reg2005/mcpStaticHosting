import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { auth } from "@mcphosting/auth";
import { ProjectService } from "@mcphosting/core";
import { getDb } from "@mcphosting/db";
import { Redis } from "ioredis";
import { buildServer } from "./tools.js";

const PORT = Number(process.env.MCP_PORT ?? 3001);

const service = new ProjectService(getDb(), {
  baseDomain: process.env.PUBLIC_BASE_DOMAIN ?? process.env.BASE_DOMAIN ?? "lvh.me",
  repoRoot: process.env.REPO_ROOT ?? "./data/repos",
  snapshotRoot: process.env.SNAPSHOT_ROOT ?? "./data/snapshots",
  dataRoot: process.env.JSON_DATA_ROOT ?? "./data/json-db",
  siteScheme: process.env.PUBLIC_SITE_SCHEME,
  sitePort: process.env.PUBLIC_SITE_PORT,
});

// Coarse per-key rate limit (the apiKey plugin's own limiter is disabled). A
// fixed 60s window keyed by API-key id; fails open if Redis is unreachable so
// a transient Redis blip never locks every agent out.
const RATE_WINDOW_S = 60;
const RATE_MAX = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 600);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
});
redis.on("error", () => {}); // avoid crashing on connection blips

/** Returns null if allowed, or the seconds to wait when over the limit. */
async function rateLimit(keyId: string): Promise<number | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const bucket = now - (now % RATE_WINDOW_S);
    const redisKey = `mcprl:${keyId}:${bucket}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, RATE_WINDOW_S);
    if (count > RATE_MAX) return bucket + RATE_WINDOW_S - now;
    return null;
  } catch {
    return null; // fail open
  }
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname !== "/mcp" || req.method !== "POST") {
    return sendJson(res, 404, { error: "Not found" });
  }

  const token = bearer(req);
  if (!token) return sendJson(res, 401, { error: "Missing bearer token" });

  const verified = await auth.api.verifyApiKey({ body: { key: token } }).catch(() => null);
  if (!verified?.valid || !verified.key) return sendJson(res, 401, { error: "Invalid token" });

  const retryAfter = await rateLimit(verified.key.id);
  if (retryAfter !== null) {
    res.setHeader("retry-after", String(retryAfter));
    return sendJson(res, 429, { error: "Rate limit exceeded. Slow down." });
  }

  const user = await service.getUserById(verified.key.referenceId);
  if (!user) return sendJson(res, 401, { error: "Unknown user" });

  try {
    const body = await readBody(req);
    // Stateless: one server + transport per request keeps user scoping simple.
    const mcp = buildServer(service, user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[mcphosting/mcp] streamable HTTP listening on :${PORT}/mcp`);
});
