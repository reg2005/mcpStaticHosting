// mcphosting functions SDK — types for backend handlers. In production this is
// served from a stable URL so user code can:
//   import type { Handler } from "https://example.com/sdk/mod.ts";
//
// A handler is a default-exported function receiving a standard Request plus a
// mcphosting context (env secrets, KV store, route params).

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

export interface DataRecord<T = unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: T;
  meta?: Record<string, unknown>;
}

export interface DataStore {
  insert<T>(
    collection: string,
    data: T,
    meta?: Record<string, unknown>,
  ): Promise<DataRecord<T>>;
  list<T = unknown>(collection: string, opts?: { limit?: number; offset?: number }): Promise<DataRecord<T>[]>;
  get<T = unknown>(collection: string, id: string): Promise<DataRecord<T> | null>;
}

export interface Ctx {
  /** Per-project secrets configured via the dashboard or the MCP `set_env` tool. */
  env: Record<string, string>;
  /** Dynamic route params, e.g. functions/api/[id].ts -> ctx.params.id. */
  params: Record<string, string>;
  /** Per-project key-value store (Redis-backed, namespaced). */
  kv: KV;
  /** Per-project JSON-file database, mediated by the trusted functions host. */
  data: DataStore;
}

export type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;
