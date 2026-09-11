# ADR 0003: optional single-domain path hosting

Date: 2026-09-11. Status: accepted. Stage: independent prototype, no production users.

## Context

An operator may control one hostname's A record without access to a DNS provider API
or wildcard DNS. Projects still need automatic system URLs, custom domains and TLS.
The existing subdomain mode stays available; there is no request for a framework rewrite.

## Decision

`SITE_ROUTING_MODE=path` mounts production under `/sites/slug-userId/` and drafts
under `/preview/slug-userId/` on MAIN_DOMAIN. The same Nginx/lego edge obtains the
main hostname certificate through HTTP-01, while custom domains keep their existing
DNS verification and HTTP-01 lifecycle. Empty DNS_CREDENTIALS_PATH maps to /dev/null.
The default mode remains subdomain with DNS-01 wildcard certificates.
Lego runs with `--force-cert-domains` so changing from a single-host certificate
to wildcard updates its SAN list ([upstream flags](https://go-acme.github.io/lego/references/ref-flags/)).

Existing managed domain rows remain stable internal project-address keys. Path
resolution maps a validated namespace/label to those keys; direct subdomain requests
are disabled in path mode. There is no schema migration or copied project data.
Changing modes changes system URLs; custom-domain mappings remain independent.

Path pages enforce CSP sandbox without allow-same-origin. Nginx removes management
cookies and Authorization before forwarding hosted paths. It retains only the site
password cookie; that cookie is scoped to one production/preview prefix and uses
Secure/SameSite=None for opaque-origin asset requests. Backend function responses
cannot override CSP or set cookies on that shared host. Public resources permit
anonymous CORS so relative ES modules and fetch work. Credentialed browser requests,
storage, service workers and password-protected module apps require a custom domain.

## Alternatives and consequences

- Requiring DNS API access excludes the requested deployment scenario.
- Hosting arbitrary project HTML on the dashboard origin without a sandbox would
  expose authenticated management to project scripts. Cookie Path alone cannot
  isolate origins and is not used as the security boundary.
- Rewriting arbitrary HTML/CSS/JS paths would be incomplete and change application
  semantics. Authors use relative links or configure their framework build base.
- A separate management domain restores full origin isolation but requires a second
  DNS name. Custom domains already provide that option per project.

The path sandbox is mandatory; there is no unsafe opt-out. The existing trusted-author
and single-host limits still apply, especially for optional Deno functions. Revisit
this design if a hostile multi-tenant service or full-origin apps without custom
DNS become a requirement.

## Validation

Unit tests cover path parsing, URLs, redirect boundaries, mode validation and proxy
rules. The disposable Compose fixture exercises real HTTP-01 with Pebble, password
and preview flows, custom domains and system toggle. Chromium checks relative CSS,
links, modules/fetch, management isolation and password-protected asset loading.
