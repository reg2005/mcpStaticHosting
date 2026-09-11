# Published images

Release: **0.3.0**. Platform: **linux/amd64 (x86-64)**.
Built locally from application source commit `8b53a325d84f6424eaf30ca1312169821a218522`.
All three repositories are public; ordinary pulls do not require Docker Hub login,
subject to Docker Hub's anonymous pull limits. GitHub Actions are disabled.

| Image | Registry manifest digest |
| --- | --- |
| [reg2005/mcp-static-hosting:0.3.0](https://hub.docker.com/r/reg2005/mcp-static-hosting/tags) | `sha256:582f344ad18992ffd63103d889bea8883b0b683ee0dcbd57b1d12b320c21ee11` |
| [reg2005/mcp-static-hosting-edge:0.3.0](https://hub.docker.com/r/reg2005/mcp-static-hosting-edge/tags) | `sha256:5eada985c0a714223d0b87ed5405bdc3641d50541265c54352bde8283fc7c117` |
| [reg2005/mcp-static-hosting-functions:0.3.0](https://hub.docker.com/r/reg2005/mcp-static-hosting-functions/tags) | `sha256:18b950ab876ad9368cc1372319494f9bea6400cffd869bcaacebe16323f24c60` |

For immutable references, replace each Compose image with its repository and digest,
for example `reg2005/mcp-static-hosting-edge@sha256:5eada985c0a714223d0b87ed5405bdc3641d50541265c54352bde8283fc7c117`.
The functions runtime is unchanged from 0.1.0 and retains its original digest.

Validation: type checking, lint, 18 unit/integration tests, production dependency
audit, OpenAPI validation, three x86-64 Docker builds, registry pulls and a disposable
production Compose stack with PostgreSQL and Redis. The dependency audit reported
no known production dependency vulnerabilities; it is not a complete security audit.

The [ACME fixture](../tests/edge/README.md) uses Let's Encrypt's Pebble server with
real challenge validation. It verified main HTTP-01 without DNS credentials, custom
HTTP-01, and changing an existing main-only certificate to DNS-01 wildcard when
switching modes. Switching back preserved projects, previews and custom domains
while disabling old system URLs. Both modes passed MCP authentication, publish,
rollback, passwords, reserved-domain errors, system toggle and revocation checks.
Management CIDRs denied unauthorized/forged IPs while path sites stayed available.

Chromium on the final image verified relative CSS/links, scripts, ES modules,
anonymous fetch and password-protected asset loading. Path scripts could not read
management APIs, cookies or localStorage, or register service workers. Password forms
and preview bypass preserved project prefixes. The 0.2.0 suite additionally exercised
automatic renewal and custom DNS loss/restoration; those workflows remain unchanged.

Live Let's Encrypt and live APIs of all six DNS providers were not exercised: these
require the installation's domain and credentials. Provider examples and local test
fixtures contain no production credentials. Optional Deno application execution was
not re-tested for this release; its image is unchanged. See the documented browser
limitations of [path hosting](deployment.md#path-hosting-without-a-dns-api).
