# MCP clients and tools

Create an account in the dashboard, then open **MCP tokens** and create a token.
Tokens are displayed once, stored hashed, scoped to their user and revocable.
The supported external interface is MCP Streamable HTTP at `/mcp`, using POST requests
and the `Authorization: Bearer <token>` header. GET/SSE session establishment is not
supported by this stateless server. Use a client supporting stateless Streamable HTTP.

## Generic client configuration

```json
{
  "mcpServers": {
    "mcphosting": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}
```

Keep token-bearing client configuration out of Git. Use the dashboard's client-specific
configuration or your client's documented secret/environment facility. Public URLs
are read at runtime from `MCP_PUBLIC_URL`.

## Workflow

1. `create_project` returns the project ID and preview/production URLs.
2. `write_file` or `write_files` updates the draft.
3. `get_urls` returns the current URLs; preview serves the draft immediately.
4. `publish` creates a release snapshot and switches production to it.
5. `list_versions` and `rollback` inspect and select earlier releases.

Use `tools/list` to discover exact schemas and available file, project, domain,
password, secret and data-management tools. All project tools enforce owner scoping.
There are no narrower per-tool token scopes in this release. Write/publish operations
are not idempotent by an idempotency key; inspect state after an uncertain response
before retrying a publication.

HTTP failures: 401 for missing/invalid/revoked tokens, 429 for the configured per-key
limit (with `Retry-After`), 404 for unsupported endpoint/method. Tool failures use MCP
error responses. The limit is a Redis fixed window (default 600/minute/token), failing
open on Redis errors. Configure body and aggregate rate limits in the reverse proxy.

The dashboard's REST endpoints are an internal UI contract, not an independently
supported external integration API. A minimal [OpenAPI transport specification](openapi.yaml)
describes the externally exposed HTTP envelope; MCP tool schemas are discovered via
the protocol and are the authoritative tool contract. Breaking tool changes before
1.0 require a minor version increment and release notes.

## Automatic domains (0.2.0)

`add_domain` accepts a bare external hostname; the MAIN_DOMAIN zone is reserved.
The result has `domain` (hostname, verified, dnsStatus, tls, lastError, lastCheckedAt)
and `setup` (`dns: {type: "A", name, value}`, publicIpv4, publicIpv6, instructions).
If public IPv4 detection is pending, `value` is null; retry `custom_domain_guide` later.
No operator proxy change is required. Poll `list_domains` for `tls: "active"`.

Invalid domain input returns a tool result with `isError: true` and JSON text:
`{code:"VALIDATION_ERROR", message:"Проверьте заполнение полей", errors:[{field:"hostname", message:"...", rule:"RESERVED_DOMAIN"}]}`.
Other domain rules are `INVALID_DOMAIN`, `DOMAIN_TAKEN` and `DOMAIN_LIMIT`.

`set_system_domain` accepts `{project: "id-or-slug", enabled: false}` and returns
`{systemDomainEnabled:false}`. Both system URLs (production and preview) stop
serving; custom mappings are unchanged. Use true to re-enable. The setting is also
returned in project metadata. `remove_domain` removes a custom mapping.
