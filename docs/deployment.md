# Deployment with automatic HTTPS

Production uses **Nginx + lego**, included in the published `mcp-static-hosting-edge`
image. No host proxy, Docker socket, GitHub Actions or server-side build is needed.
All application images target Linux x86-64. Only TCP ports **80 and 443** are public.

## First installation

1. Choose `MAIN_DOMAIN`, for example `example.com`. Create DNS **A** records for
   `example.com` and `*.example.com` pointing to the server's reachable IPv4.
   The wildcard **A record is a one-time operator prerequisite**. Lego manages the
   temporary TXT challenge records and certificates, not the A records.
2. Open inbound TCP 80/443. Forward both ports if the server is behind NAT. Keep
   these DNS records unproxied (e.g. Cloudflare “DNS only”). Do not publish AAAA
   unless IPv6 reaches this instance and `PUBLIC_IPV6` is configured.
3. Run `sh scripts/setup.sh --production`. Fill in `.env.production`:

```dotenv
MAIN_DOMAIN=example.com
ACME_EMAIL=admin@example.com
DNS_PROVIDER=cloudflare
DNS_CREDENTIALS_PATH=./secrets/dns.env
PUBLIC_IPV4=
MANAGEMENT_ALLOWED_CIDRS=
SIGNUPS_ENABLED=true
```

4. Create the DNS credentials file from one of the [six examples](../examples/dns).
   Do not put provider secrets in `.env.production` or the image:

```sh
mkdir -p secrets
chmod 700 secrets
cp examples/dns/cloudflare.env.example secrets/dns.env
# Fill in secrets/dns.env in your editor.
chmod 644 secrets/dns.env
```

The private **parent directory is mode 0700**. The mounted file must be readable by
container UID 1000; mode 0644 inside that private directory works with standalone
Compose bind-mounted secrets. Alternatively make UID 1000 own a mode 0600 file.
`secrets/` is excluded from Git and Docker contexts. Only the edge receives the file,
read-only at `/run/secrets/dns_credentials`. The parser does not run shell commands
or expand `$VARIABLE` references. Quote values containing `#` or spaces.

5. Start the installation:

```sh
sh scripts/compose-prod.sh pull
sh scripts/compose-prod.sh up -d --wait
sh scripts/compose-prod.sh logs -f edge
```

At startup the edge attempts to issue one certificate for `example.com` and
`*.example.com` through the selected provider's **DNS-01** API. It opens HTTP first;
the dashboard returns a temporary 503 while the initial certificate is pending.
Unknown HTTPS names are rejected. `PROXY_CONFIGURED` reports applied configuration;
`WILDCARD_ACME_READY` reports certificate issuance. A healthy edge container indicates
that the controller/proxy is running, **not** that the DNS provider has completed
issuance. If issuance fails, it retries with delays from one minute to one hour;
existing valid certificates continue working. Provider output is not logged because
it can contain credentials. Check the configured provider, credentials, zone access,
CAA and DNS reachability if `WILDCARD_ACME_RETRY_CHECK_DNS_CREDENTIALS` persists.

6. Open `https://example.com`, register the first account, then set
   `SIGNUPS_ENABLED=false` and run `sh scripts/compose-prod.sh up -d` if this is a
   private installation. MCP is at `https://example.com/mcp`.

Without `RESEND_API_KEY`, verification emails and password-reset delivery are
unavailable. For email, configure Resend and a verified `EMAIL_FROM` sender.

## Management subnet allowlist

```dotenv
MANAGEMENT_ALLOWED_CIDRS=192.0.2.0/24,198.51.100.42/32,2001:db8::/32
```

Replace documentation addresses with real networks. Commas or spaces separate IPv4,
IPv6 CIDRs or individual IPs. Empty means **no IP restriction**. Authentication and
`SIGNUPS_ENABLED` still apply. Invalid entries stop the edge instead of allowing all.

The allowlist covers the entire dashboard, authentication, its APIs, and MCP. It
does not restrict hosted sites or ACME HTTP-01. Nginx uses the connecting socket IP,
ignores client-supplied forwarded IP headers, and replaces them before proxying.
Deploy the edge directly on the public server. Another CDN/load balancer in front
would change the source IP and is not supported by this allowlist configuration.
Application/database/worker ports are not published in production.

## System and custom domains

Every new project receives `slug-userId.example.com` and
`preview--slug-userId.example.com`, both covered by the same wildcard. The **System
domain** switch disables both addresses without deleting the project or custom
mappings. It is reversible; the editor's embedded preview needs this switch enabled.

A custom hostname can be outside `MAIN_DOMAIN`, including an apex or subdomain and
IDN names. `example.com`, `sdfsd.example.com` and any deeper subdomain are rejected.
The form and API return the localized error `RESERVED_DOMAIN`.

After adding `adas.com`, the panel/MCP shows `A adas.com → <instance IPv4>`. By default,
the edge determines IPv4 from agreement between ipify and AWS CheckIP over HTTPS,
refreshing every ten minutes. Set `PUBLIC_IPV4` when egress IP differs from ingress
(e.g. NAT, a proxy or multiple public addresses). An explicit value takes precedence.

The worker checks public A/AAAA DNS approximately every minute using `DNS_RESOLVERS`.
All A answers must equal the instance IPv4. AAAA records must be absent or match
`PUBLIC_IPV6`. A DNS timeout keeps the previous verified state; an actual mismatch
disables the route. Large queues may take longer; work is bounded to 20 domains per
batch and certificate jobs are serialized.

When DNS matches, lego requests an ordinary hostname certificate using **HTTP-01**
through port 80. No wildcard, user DNS credentials, manual proxy edit, or first
browser visit is required. The domain serves content only after certificate issuance.
Status and safe error messages appear in the dashboard; failed requests retry with
persisted backoff. The worker renews certificates when fewer than 30 days remain and
reloads Nginx after validating its configuration. Deleted/unverified mappings are
removed on reconciliation; the application blocks them immediately on lookup.

Domain allocation is first-claim within this installation. A matching A record proves
routing to this server, **not which local account owns a DNS zone**. Use trusted
accounts; this is not a hostile multi-tenant SaaS domain-ownership protocol.

## Data, upgrades and staging

Back up the `edge` named volume (ACME accounts/private keys/certificates), application
`sites` volume, PostgreSQL and installation secrets. Run one edge replica; an OS file
lock prevents concurrent writers to its volume. This is a single-host deployment.

Version 0.2.0 changes production configuration to `MAIN_DOMAIN`, changes preview
hostnames, and resets custom mappings to DNS-pending on migration. The migration
renames existing preview host records. Use the previous site base domain as the new
`MAIN_DOMAIN`; changing the base domain of existing projects is not automatically
migrated. There are no compatibility aliases for old preview URLs. Back up before an
upgrade. The project remains a new prototype with no existing production users.

For a disposable staging deployment set
`ACME_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory`. Its certificates
are not browser-trusted. Separate Compose project names keep tests out of real data.
Storage is namespaced by ACME server URL, so staging certificates cannot be reused
as production certificates after switching the URL. ACME calls accept that CA's
terms of service using the operator-provided `ACME_EMAIL`.

For optional trusted-author functions:
`sh scripts/compose-prod.sh --profile functions up -d --wait` with
`FUNCTIONS_ENABLED=true`. See [functions](functions.md).
