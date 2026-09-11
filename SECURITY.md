# Security policy

## Supported versions

Only the latest published 0.1.x release receives fixes. This is an early release,
not an audited multi-tenant hosting platform. Install for trusted users on a
single server. Keep functions disabled unless their authors are trusted.

## Report privately

Use the repository's **Security → Report a vulnerability** when available. If that
option is unavailable, open an issue asking for a private contact without including
exploit details, credentials, user data or logs. Never post real `.env` files,
rendered Compose configuration, session cookies or API keys in an issue.

## Boundaries and current limitations

- MCP tokens are bearer credentials. Use TLS, protect tokens and revoke lost tokens.
- `.env` and persistent volumes are not included in Git or Docker build contexts.
- The host and Docker administrators can read runtime configuration and site data.
- Use a separate registrable domain for untrusted site content and the dashboard.
- Close registration after onboarding trusted users. Add edge rate/request limits.
- Custom domains require matching public DNS and successful HTTP-01 certificate issuance.
  This proves routing to the instance, not which local account owns the zone.
- The MCP rate limiter fails open on Redis failure. There is no storage quota system.
- Optional Deno workers restrict file and environment permissions, but allow network
  access. They do not provide a hardened boundary against SSRF or malicious authors.
  Never expose their invoker directly. Do not enable functions for hostile tenants.
- JSON collections and Git publishing are single-host features; concurrent write
  guarantees and multi-host coordination are outside this release's scope.
- Dependency and container scans must be reviewed with every release. Passing tests
  is not a guarantee that the application is free of vulnerabilities.

Keep `APP_SECRET` and database/site backups together in encrypted, access-controlled
storage. See [operations](docs/operations.md) for backup and upgrade procedures.

## Shared-host path mode

Path-hosted documents enforce an opaque-origin CSP sandbox. Do not remove it or add
`allow-same-origin`: arbitrary project HTML would then share the dashboard origin.
The proxy drops management credentials on `/sites/` and `/preview/`; browser API
mutations from `Origin: null` are rejected. Project password cookies have per-path
scope. Function responses cannot override CSP or emit cookies on path sites.
Full browser storage/credentialed-fetch/service-worker applications should use a custom
domain. This is a single-host trusted-author service; optional Deno execution is
not an isolation boundary for hostile code.
