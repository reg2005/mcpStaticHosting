/// <reference lib="deno.worker" />
//
// Sandboxed worker bootstrap. Runs ONE user handler module under restricted
// permissions (set by the host when the worker is created). The user code never
// gets direct infra access: ctx.kv is an RPC proxy back to the trusted host.

// deno-lint-ignore no-explicit-any
let handler: ((req: Request, ctx: any) => Response | Promise<Response>) | undefined;

const pendingKv = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let kvSeq = 0;

function kvCall(op: string, args: unknown[]): Promise<unknown> {
  const id = ++kvSeq;
  return new Promise((resolve, reject) => {
    pendingKv.set(id, { resolve, reject });
    (self as unknown as Worker).postMessage({ type: "kv", id, op, args });
  });
}

const kv = {
  get: (k: string) => kvCall("get", [k]) as Promise<string | null>,
  set: (k: string, v: string, opts?: { ttlSeconds?: number }) => kvCall("set", [k, v, opts]) as Promise<void>,
  del: (k: string) => kvCall("del", [k]) as Promise<void>,
  incr: (k: string) => kvCall("incr", [k]) as Promise<number>,
};

function dataCall(op: string, args: unknown[]): Promise<unknown> {
  const id = ++kvSeq;
  return new Promise((resolve, reject) => {
    pendingKv.set(id, { resolve, reject });
    (self as unknown as Worker).postMessage({ type: "data", id, op, args });
  });
}

const data = {
  insert: (collection: string, value: unknown, meta?: Record<string, unknown>) =>
    dataCall("insert", [collection, value, meta]),
  list: (collection: string, opts?: { limit?: number; offset?: number }) =>
    dataCall("list", [collection, opts]),
  get: (collection: string, id: string) => dataCall("get", [collection, id]),
};

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      const mod = await import(msg.modulePath);
      handler = mod.default;
      if (typeof handler !== "function") throw new Error("functions file must `export default` a handler");
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "initError", error: String((err as Error)?.stack ?? err) });
    }
    return;
  }

  if (msg.type === "kvResult") {
    const p = pendingKv.get(msg.id);
    if (p) {
      pendingKv.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.value);
    }
    return;
  }

  if (msg.type === "invoke") {
    const { id, request, env, params } = msg;
    const logs: { level: string; msg: string }[] = [];
    for (const lvl of ["log", "info", "warn", "error", "debug"] as const) {
      // deno-lint-ignore no-explicit-any
      (console as any)[lvl] = (...a: unknown[]) =>
        logs.push({ level: lvl, msg: a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") });
    }

    try {
      const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body != null;
      const req = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: hasBody ? request.body : undefined,
      });
      const res = await handler!(req, { env, params, kv, data });
      const buf = new Uint8Array(await res.arrayBuffer());
      const headers = Object.fromEntries(res.headers.entries());
      self.postMessage({ type: "result", id, status: res.status, headers, body: buf, logs }, [buf.buffer]);
    } catch (err) {
      const body = new TextEncoder().encode("Function error: " + String((err as Error)?.stack ?? err));
      self.postMessage({ type: "result", id, status: 500, headers: { "content-type": "text/plain" }, body, logs });
    }
  }
};
