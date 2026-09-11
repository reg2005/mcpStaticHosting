# Changelog

Notable changes use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and Semantic Versioning.

## [Unreleased]

## [0.3.0] - 2026-09-11

### Added
- Optional path hosting on one domain with HTTP-01 for the main certificate; no DNS API credentials or wildcard DNS required.
- Production and preview paths, project-scoped password cookies and path-aware preview bypass/redirects.
- Opaque-origin browser sandbox for path sites; management credentials are removed before forwarding to hosted content.
- Documentation of relative asset/build paths and custom domains for full browser-origin capabilities.

### Fixed
- Access logging tolerates a socket already closed when a response finishes.
- Password-protected site responses are marked private and not cached.

### Changed
- DNS provider settings are required only in the default subdomain mode. Blank DNS_CREDENTIALS_PATH mounts an empty file.
- Custom domain automation and the system-address toggle work in both modes; no database migration is required.


## [0.2.0] - 2026-09-11

### Added
- Bundled Nginx edge image with automatic DNS-01 wildcard certificates at startup.
- Automatic public IPv4 discovery, periodic A/AAAA checks, HTTP-01 certificates for custom domains, renewal and persisted retry backoff.
- Management subnet allowlist for IPv4/IPv6; empty permits any source IP.
- Dashboard domain form with DNS instructions, HTTPS status, localized errors and system-domain toggle; equivalent MCP tool.
- Credentials examples for Cloudflare, Route 53, DigitalOcean, OVH, Hetzner and Selectel v2.

### Changed
- Production configuration now uses MAIN_DOMAIN for the dashboard, MCP and managed subdomains; only ports 80/443 are exposed.
- Preview hostnames now use preview--slug-userId.MAIN_DOMAIN so one wildcard covers both system addresses.
- Existing custom mappings return to DNS-pending until routing and TLS are verified.

### Security
- Reject MAIN_DOMAIN and all its subdomains as custom mappings.
- Disable unverified custom-domain routing; remove routes when DNS moves away.
- Use host-bound session cookies and overwrite forwarded IP headers at ingress.
- Isolate DNS credentials and ACME state to the non-root edge container.

## [0.1.0] - 2026-09-11

### Added
- Independent Docker Compose distribution for MCP-driven static hosting.
- Shared Node image, optional Deno image and automatic database migrations.
- English and Russian setup documentation, operations and security guidance.
- Runtime domain configuration and unique-secret setup script.
- Local validation and x86-64 image publication instructions.
- Standalone production Compose with published image references.

### Fixed
- Correct hostname registration when site URLs include a custom port.

### Security
- Updated runtime dependencies to versions passing the current production dependency audit.
- Excluded source deployment history, environment files and user data.
- Bind application ports to localhost by default; databases stay internal.
- Disable backend function execution by default.
- Do not log email verification or password reset links.
- Block static access to dotfiles and unsafe site-gate redirect destinations.
- Remove development authentication bypass and serve editor assets locally.
