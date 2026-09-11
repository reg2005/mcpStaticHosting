# Deployment with Docker Compose

## Local evaluation

Follow the README quick start. It binds web, MCP and router to localhost. PostgreSQL,
Redis and Deno have no published ports. Migrations run once before application
services start; health checks delay startup until PostgreSQL and Redis are ready.

## Public server behind a TLS proxy

1. Point `panel.example.com` and `mcp.example.com` to your server.
2. Use a **separate registrable domain** for user content, for example
   `sites.example.net`, `*.sites.example.net` and `*.preview.sites.example.net`.
   This keeps user-controlled pages out of the dashboard's cookie/site boundary.
3. Generate `.env.production` with `sh scripts/setup.sh --production` and set:

```dotenv
AUTH_BASE_URL=https://panel.example.com
MCP_PUBLIC_URL=https://mcp.example.com/mcp
PUBLIC_BASE_DOMAIN=sites.example.net
BIND_ADDRESS=127.0.0.1
```

4. Run `sh scripts/compose-prod.sh pull` and `sh scripts/compose-prod.sh up -d --wait`.
   The standalone `compose.prod.yaml` pins image repositories and the x86-64 platform.
5. Configure your host reverse proxy using this routing table:

| Host | Upstream |
| --- | --- |
| `panel.example.com` | `http://127.0.0.1:3000` |
| `mcp.example.com` | `http://127.0.0.1:3001` |
| `*.sites.example.net` | `http://127.0.0.1:3002` |
| `*.preview.sites.example.net` | `http://127.0.0.1:3002` |
| Approved custom domains | `http://127.0.0.1:3002` |

Preserve the original `Host`, set `X-Forwarded-Proto: https`, and overwrite forwarded
headers from untrusted clients. Disable response buffering for MCP and allow long
SSE responses. Terminate TLS at the proxy. Wildcard certificates require your DNS
provider's challenge integration; a `*.sites.example.net` certificate does **not**
cover `*.preview.sites.example.net`. Obtain both certificates. There is no bundled
DNS-provider token or automatic wildcard-certificate configuration.

`infra/nginx.conf.example` shows routing for a host-installed Nginx using certificates
you provision. Adapt paths and hostnames. A containerized proxy must join an explicit
shared network; its `127.0.0.1` is not the Docker host. Do not expose database ports
or attach PostgreSQL/Redis to a public proxy network.

Set limits at the edge for request size, request frequency, login attempts and site
password attempts. The MCP limiter defaults to 600 requests per token per minute and
currently fails open if Redis is unavailable. Keep signups closed except when inviting
trusted accounts: set `SIGNUPS_ENABLED=false` after initial registration, then run
`sh scripts/compose-prod.sh up -d` to recreate affected services.

## Email

Without `RESEND_API_KEY`, signup does not require email verification and password
reset delivery is unavailable. Emails and reset links are never printed to logs.
For verified email and password resets, set `RESEND_API_KEY` and `EMAIL_FROM` using a
sender domain you own and have verified with Resend. Restart the application services.

## Custom domains

Add a domain to a project, configure DNS to point at this server, and manually add
that domain/certificate to the TLS proxy. The application stores domain mappings;
this release does not prove ownership through a DNS challenge. Only trusted operators
should configure custom domains. Automatic on-demand TLS is not part of the default
Compose installation.

## Experimental backend functions

Set `FUNCTIONS_ENABLED=true` and start the profile:

```sh
docker compose --profile functions up -d --wait
```

See [functions](functions.md) before enabling it. Use only trusted authors. For a
source build, add `-f compose.yaml -f compose.build.yaml` and build `functions` first.

## References

- [Docker Compose startup ordering](https://docs.docker.com/compose/how-tos/startup-order/)
- [Next.js self-hosting and runtime configuration](https://nextjs.org/docs/app/guides/self-hosting)
