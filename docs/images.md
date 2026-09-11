# Published images

Release: **0.1.0**. Platform: **linux/amd64 (x86-64)**.
Built locally and verified with the standalone production Compose on a fresh database.
Both repositories are public; Docker Hub login is not required for ordinary pulls,
subject to Docker Hub's anonymous pull limits.

| Image | Registry manifest digest |
| --- | --- |
| [reg2005/mcp-static-hosting:0.1.0](https://hub.docker.com/r/reg2005/mcp-static-hosting/tags) | `sha256:e55735097f75dbe11398dbb3857a4eadc4b67b63acc306bc3070cffd811e63f6` |
| [reg2005/mcp-static-hosting-functions:0.1.0](https://hub.docker.com/r/reg2005/mcp-static-hosting-functions/tags) | `sha256:18b950ab876ad9368cc1372319494f9bea6400cffd869bcaacebe16323f24c60` |

For immutable references, replace the corresponding `image` in your copy of Compose
with `reg2005/mcp-static-hosting@sha256:e55735097f75dbe11398dbb3857a4eadc4b67b63acc306bc3070cffd811e63f6`
and the functions digest above. Update those references deliberately with each release.

Validation performed locally: type checking, correctness lint, four unit/integration
tests, production dependency audit, both Docker builds, and the full running-stack
smoke test. The smoke test covers registration, anonymous key-creation rejection,
MCP keys, runtime URLs, publishing and rollback, preview isolation, dotfiles and
traversal, passwords, owner isolation, revocation, local Monaco assets, optional Deno
execution and JSON records through the dashboard API. The dependency audit reported
no known production dependency vulnerabilities at release time; this is not a complete
security audit. DNS/TLS certificate provisioning is operator-specific and was not
performed by the test. GitHub Actions are intentionally disabled.
