# Experimental backend functions

Disabled by default. Set `FUNCTIONS_ENABLED=true` and run
`docker compose --profile functions up -d --wait`. Only enable for trusted authors:
network egress is unrestricted and workers are not a hardened hostile-code boundary.
The invoker has no published host port and receives no application/database secrets.

`functions/api/hello.ts` handles `/api/hello`; `functions/api/[id].ts` handles `/api/:id`.

```ts
export default async function handler(req: Request, ctx: { params: Record<string, string> }) {
  return Response.json({ greeting: 'Hello', id: ctx.params.id });
}
```

Handlers receive `ctx.env` (project secrets), `ctx.params`, `ctx.kv` and `ctx.data`.
`ctx.kv` supports `get`, `set`, `del` and `incr`. `ctx.data` supports JSON collection
`insert`, `list` and `get`. The MCP tools expose guides and a lead-form template.
Project secrets are encrypted in PostgreSQL using a key derived from `APP_SECRET`.
Draft functions run from the preview repository; published functions use the release
snapshot. Restart the function service if a warm worker retains an earlier draft.

JSON collections are intended for low-volume prototypes, not concurrent transactional
workloads. Back up their files as part of the sites volume and Redis for KV.
