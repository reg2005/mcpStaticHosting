# Published images

Release: **0.2.0**. Platform: **linux/amd64 (x86-64)**.
Built locally from source commit `15eb61d902003cea4fb9d77fac6f5ec5e3258896`.
All three repositories are public; ordinary pulls do not require Docker Hub login,
subject to Docker Hub's anonymous pull limits. GitHub Actions are disabled.

| Image | Registry manifest digest |
| --- | --- |
| [reg2005/mcp-static-hosting:0.2.0](https://hub.docker.com/r/reg2005/mcp-static-hosting/tags) | `sha256:caf10970fdf6fdb04744c87b9b4ef017dd7e8046b8ed12941c610ecf6b1d7139` |
| [reg2005/mcp-static-hosting-edge:0.2.0](https://hub.docker.com/r/reg2005/mcp-static-hosting-edge/tags) | `sha256:12af4a40c837203226fe6481e2cdb06a6790bf2c580abb582752f3d9b27cd52f` |
| [reg2005/mcp-static-hosting-functions:0.2.0](https://hub.docker.com/r/reg2005/mcp-static-hosting-functions/tags) | `sha256:18b950ab876ad9368cc1372319494f9bea6400cffd869bcaacebe16323f24c60` |

For immutable deployment references, replace each Compose image with its repository
and digest, for example
`reg2005/mcp-static-hosting-edge@sha256:12af4a40c837203226fe6481e2cdb06a6790bf2c580abb582752f3d9b27cd52f`.
Update those references deliberately with each release. The optional functions runtime
is unchanged from 0.1.0 and retains the same digest.

Validation performed locally: type checking, lint, 14 unit/integration tests,
production dependency audit, OpenAPI validation, all three x86-64 Docker builds,
registry pulls and a disposable production Compose stack with PostgreSQL and Redis.
The dependency audit reported no known production dependency vulnerabilities at
release time; it is not a complete security audit.

The [ACME fixture](../tests/edge/README.md) uses Let's Encrypt's Pebble server with
real DNS-01 and HTTP-01 challenge validation. It verified wildcard issuance at boot,
custom-domain issuance after DNS correction, automatic certificate renewal and Nginx
reload, DNS loss/restoration, reserved-domain errors, account isolation, system-domain
disable/enable, management subnet restrictions and rejection of spoofed forwarded IPs.
The MCP test through HTTPS covered authentication, domain tools, publishing and
rollback, preview URLs, passwords, path boundaries and key revocation. Dashboard
cookies and sibling-origin request rejection were also checked.

Live Let's Encrypt issuance and live APIs of all six documented DNS providers were
not exercised: these require the installation's own domain and credentials. All six
providers are present in the pinned lego binary. The fixture never uses production
credentials or public certificate issuance.
