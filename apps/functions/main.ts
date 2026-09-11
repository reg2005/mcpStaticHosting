// mcphosting functions invoker (Deno). Receives invocations from the Node router
// and runs each project's handler in a sandboxed, warm-cached Worker.
//
// The worker has no infra access; this trusted host mediates KV (Redis) and
// captures logs. Run with explicit, minimal permissions (see deno.json).
import { Redis } from "npm:ioredis@5.4.1";
import { dirname, join } from "node:path";
import { fileURLToPath as fromFileUrl, pathToFileURL as toFileUrl } from "node:url";

const PORT = Number(Deno.env.get("FUNCTIONS_PORT") ?? 3003);
const REDIS_URL = Deno.env.get("REDIS_URL") ?? "redis://localhost:6379";
const TIMEOUT_MS = Number(Deno.env.get("FUNCTION_TIMEOUT_MS") ?? 10_000);
const LOG_RING = 200;
const JSON_DATA_ROOT = Deno.env.get("JSON_DATA_ROOT") ?? "./data/json-db";

const redis = new Redis(REDIS_URL);
const APP_DIR = dirname(fromFileUrl(import.meta.url));
const COLLECTION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

interface InvokePayload {
  projectId: string;
  dir: string; // absolute path of the served directory (snapshot or draft)
  file: string; // handler path relative to dir, e.g. "functions/api/hello.ts"
  params: Record<string, string>;
  env: Record<string, string>;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null; // base64
}

interface LogLine { level: string; msg: string }
interface ResultMsg { type: "result"; id: number; status: number; headers: Record<string, string>; body: Uint8Array; logs: LogLine[] }

/** One warm worker bound to a single handler module of a single project. */
class SandboxWorker {
  private worker: Worker;
  private ready: Promise<void>;
  private seq = 0;
  private pending = new Map<number, (r: ResultMsg) => void>();

  constructor(private readonly projectId: string, dir: string, modulePath: string) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      // @ts-ignore Deno-specific worker permissions
      deno: {
        permissions: {
          read: [dir, APP_DIR],
          net: true, // outbound fetch (SSRF hardening is a follow-up)
          env: false,
          run: false,
          ffi: false,
          write: false,
          sys: false,
        },
      },
    });

    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === "ready") return resolve();
        if (msg.type === "initError") return reject(new Error(msg.error));
        if (msg.type === "kv") return void this.handleKv(msg);
        if (msg.type === "data") return void this.handleData(msg);
        if (msg.type === "result") {
          const done = this.pending.get(msg.id);
          if (done) {
            this.pending.delete(msg.id);
            done(msg);
          }
        }
      };
    });
    this.worker.postMessage({ type: "init", modulePath });
  }

  private async handleKv(msg: { id: number; op: string; args: unknown[] }) {
    const ns = `fn:${this.projectId}:`;
    const [k, v, opts] = msg.args as [string, string, { ttlSeconds?: number } | undefined];
    try {
      let value: unknown;
      switch (msg.op) {
        case "get": value = await redis.get(ns + k); break;
        case "set": opts?.ttlSeconds ? await redis.set(ns + k, v, "EX", opts.ttlSeconds) : await redis.set(ns + k, v); break;
        case "del": await redis.del(ns + k); break;
        case "incr": value = await redis.incr(ns + k); break;
        default: throw new Error(`unknown kv op ${msg.op}`);
      }
      this.worker.postMessage({ type: "kvResult", id: msg.id, value });
    } catch (err) {
      this.worker.postMessage({ type: "kvResult", id: msg.id, error: String(err) });
    }
  }

  private collectionFile(collection: string): string {
    if (!COLLECTION_RE.test(collection)) {
      throw new Error("Collection must be 1-64 letters, numbers, dashes or underscores");
    }
    return join(JSON_DATA_ROOT, this.projectId, `${collection}.json`);
  }

  private async readCollection(collection: string): Promise<Record<string, unknown>[]> {
    try {
      const raw = await Deno.readTextFile(this.collectionFile(collection));
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return [];
      throw err;
    }
  }

  private async writeCollection(collection: string, records: Record<string, unknown>[]) {
    const file = this.collectionFile(collection);
    await Deno.mkdir(dirname(file), { recursive: true });
    await Deno.writeTextFile(file, `${JSON.stringify(records, null, 2)}\n`);
  }

  private async handleData(msg: { id: number; op: string; args: unknown[] }) {
    try {
      let value: unknown;
      const [collection] = msg.args as [string];
      const records = await this.readCollection(collection);

      switch (msg.op) {
        case "insert": {
          const [, data, meta] = msg.args as [string, unknown, Record<string, unknown> | undefined];
          const now = new Date().toISOString();
          const record = {
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            status: "new",
            data,
            meta,
          };
          records.push(record);
          await this.writeCollection(collection, records);
          value = record;
          break;
        }
        case "list": {
          const [, opts] = msg.args as [string, { limit?: number; offset?: number } | undefined];
          const offset = Math.max(0, opts?.offset ?? 0);
          const limit = Math.min(Math.max(1, opts?.limit ?? 100), 500);
          value = records
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(offset, offset + limit);
          break;
        }
        case "get": {
          const [, id] = msg.args as [string, string];
          value = records.find((record) => record.id === id) ?? null;
          break;
        }
        default:
          throw new Error(`unknown data op ${msg.op}`);
      }
      this.worker.postMessage({ type: "kvResult", id: msg.id, value });
    } catch (err) {
      this.worker.postMessage({ type: "kvResult", id: msg.id, error: String(err) });
    }
  }

  whenReady() {
    return this.ready;
  }

  invoke(payload: InvokePayload): Promise<ResultMsg> {
    const id = ++this.seq;
    const body = payload.body ? Uint8Array.from(atob(payload.body), (c) => c.charCodeAt(0)) : null;
    return new Promise<ResultMsg>((resolve, reject) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({
        type: "invoke",
        id,
        env: payload.env,
        params: payload.params,
        request: { method: payload.method, url: payload.url, headers: payload.headers, body },
      });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          this.worker.terminate();
          workers.delete(`${payload.dir}|${payload.file}`);
          reject(new Error("timeout"));
        }
      }, TIMEOUT_MS);
    });
  }
}

const workers = new Map<string, SandboxWorker>();

function getWorker(payload: InvokePayload): SandboxWorker {
  const key = `${payload.dir}|${payload.file}`;
  let w = workers.get(key);
  if (!w) {
    w = new SandboxWorker(payload.projectId, payload.dir, toFileUrl(join(payload.dir, payload.file)).href);
    workers.set(key, w);
  }
  return w;
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/healthz") return Response.json({ ok: true });
  if (url.pathname !== "/invoke" || req.method !== "POST") return new Response("not found", { status: 404 });

  const payload = (await req.json()) as InvokePayload;

  try {
    const worker = getWorker(payload);
    await worker.whenReady();
    const result = await worker.invoke(payload);

    if (result.logs.length) {
      const pipe = redis.pipeline();
      for (const l of result.logs) {
        pipe.lpush(`fnlog:${payload.projectId}`, JSON.stringify({ ...l, ts: Date.now() }));
      }
      pipe.ltrim(`fnlog:${payload.projectId}`, 0, LOG_RING - 1);
      await pipe.exec();
    }

    return new Response(result.body as unknown as BodyInit, {
      status: result.status,
      headers: result.headers,
    });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    return new Response(`Function ${msg}`, { status: msg === "timeout" ? 504 : 500 });
  }
});

console.log(`[mcphosting/functions] invoker listening on :${PORT}`);
