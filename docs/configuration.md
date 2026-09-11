# Configuration

Local `compose.yaml` reads `.env`; standalone `compose.prod.yaml` reads
`.env.production` through `scripts/compose-prod.sh`. Production fixes image repositories
to `reg2005/mcp-static-hosting` and `reg2005/mcp-static-hosting-functions`, requires
public domains, uses HTTPS without a site port, and closes registration by default.
Both distributions select `linux/amd64`.

All deployment values are read at container startup. No domain-specific rebuild is
required. Edit `.env`, then run `docker compose up -d`. Restart alone does not apply
changed Compose environment values. Do not paste rendered Compose output into issues:
it contains resolved secrets.

| Variable | Default / purpose |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | `mcp-static-hosting`; namespace for containers/volumes; keep stable |
| `IMAGE_NAMESPACE` | Docker Hub image owner |
| `IMAGE_TAG` | `0.1.0`; use a released version |
| `BIND_ADDRESS` | `127.0.0.1`; host bind interface |
| `WEB_PORT`, `MCP_PORT`, `ROUTER_PORT` | Host ports 3000, 3001, 3002; internal ports stay fixed |
| `AUTH_BASE_URL` | Public dashboard origin, including scheme and optional port |
| `MCP_PUBLIC_URL` | Complete public MCP URL ending in `/mcp`; shown in dashboard configs |
| `PUBLIC_BASE_DOMAIN` | Site hostname suffix, no scheme/port; `lvh.me` for local use |
| `PUBLIC_SITE_SCHEME` | `http` locally; use `https` behind TLS |
| `PUBLIC_SITE_PORT` | `3002` locally; leave empty behind TLS |
| `APP_SECRET` | Generated 64-character secret for sessions, encrypted project secrets and access cookies |
| `POSTGRES_PASSWORD` | Generated hex password; connection URL is derived inside Compose |
| `SIGNUPS_ENABLED` | `true`; set `false` after trusted users register |
| `RESEND_API_KEY` | Optional email delivery credential |
| `EMAIL_FROM` | Verified sender for email delivery |
| `MCP_RATE_LIMIT_PER_MIN` | `600`; fixed-window limit per API key |
| `FUNCTIONS_ENABLED` | `false`; requires `functions` Compose profile as well |
| `FUNCTION_TIMEOUT_MS` | `10000`; function request timeout |

The containers receive `DATABASE_URL`, `REDIS_URL`, `REPO_ROOT`, `SNAPSHOT_ROOT` and
`JSON_DATA_ROOT` from Compose; the defaults use internal service names and `/data`.
Secrets are passed as runtime environment variables, never build arguments or image
layers. Docker administrators can inspect container environment variables; limit host
access and protect `.env` with mode 0600. Use your orchestrator's secret integration
when your deployment requires file-mounted secrets; this release does not implement
`*_FILE` variables.

Changing `APP_SECRET` invalidates sessions/access cookies and prevents decrypting
existing project secrets. Back it up securely and do not casually regenerate it.
Changing `POSTGRES_PASSWORD` in `.env` does not change the password in an existing
PostgreSQL volume; coordinate the database role update before recreating services.
