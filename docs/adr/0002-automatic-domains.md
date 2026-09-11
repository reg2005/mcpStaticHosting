# ADR 0002: bundled Nginx with a single certificate controller

Date: 2026-09-11. Status: accepted. Stage: independent prototype, no users/data.

The distribution must automatically serve system and arbitrary custom domains,
support DNS-provider credentials including Selectel v2, and restrict management by
source subnet. The owner requested local x86 builds and Docker Compose, without Actions.

We use Nginx and lego v5 in one non-root edge container. Lego includes provider
adapters; Caddy would need a provider-specific plugin build or additional ACME
integration for this broad provider set. A small TypeScript worker reuses PostgreSQL
metadata and drives DNS verification, certificate issuance and validated Nginx reloads.
No broker is needed for a periodically reconciled desired state on one host. Domain
status/retry deadlines live in PostgreSQL; ACME files and wildcard retry state live
in the locked edge volume. An OS lock enforces one controller per volume.

Dashboard and MCP use the MAIN_DOMAIN apex. System production/preview hosts each
have one label underneath, sharing a wildcard certificate. Subdomains of this zone
are reserved. Hosted sibling sites require host-only `__Host-` authentication cookies
and explicit origin checks; this project still assumes trusted site authors.
Disabling system addresses affects production and preview immediately in the router.

Management ACLs use the socket peer IP in Nginx. We publish no direct application
ports, trust no forwarded source IP, and do not support another proxy/CDN ahead of
this edge by default. Hosted sites and HTTP challenges bypass management ACLs.

Each custom domain is DNS-pending until all A/AAAA answers reach the instance. A
matching A record establishes routing, not account ownership; first-claim allocation
is intentional for trusted users. Hostile multi-tenant signup would require an
additional ownership token/verification protocol before domain claims.

ACME work is serialized and retried with backoff. Existing valid certificates remain
usable during renewal errors. Certificates and account state are partitioned by CA
URL to isolate staging. Configuration is validated before reload; no container gets
the Docker socket. Logs use fixed codes instead of raw provider responses.

Revisit this design for multiple edge replicas, shared object storage, distributed
certificate locking, untrusted tenants, or ingress behind a trusted load balancer.
