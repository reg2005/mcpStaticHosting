# Automatic TLS integration test

The fixture runs the real lego binary against Let's Encrypt's **Pebble** ACME test
server. Challenge validation is enabled: Pebble actually reads DNS TXT records and
fetches HTTP-01 from Nginx. A local DNS/provider fixture accepts lego's `httpreq`
present/cleanup calls and serves A/AAAA/TXT/SOA/NS responses. No public CA, real
provider credential, public domain, or privileged host port is involved.

Build the three 0.2.0 images locally first. Run from the repository root with Compose
2.24.4+ (`!override` support). Choose a disposable directory; the setup script creates
random test credentials and downloads the public Pebble test CA/config from v2.8.0:

```sh
python3 tests/edge/setup.py /tmp/mcph-edge-test
# Use the same env file in every command below.
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml up -d --wait edge
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml run --rm --no-deps runner
```

Also exercise the full MCP transport through the new TLS proxy:

```sh
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml run --rm --no-deps --entrypoint node runner /fixtures/mcp.mjs
```

This covers wildcard issuance on boot, real HTTP-01 after A-record correction,
system-domain disable/enable, publish, custom-domain isolation, DNS loss/restoration,
reserved-domain validation, authenticated dashboard cookies and sibling-origin rejection.
The `rejectUnauthorized:false` in this **test client only** trusts ephemeral Pebble
site certificates; the worker itself trusts the mounted public Pebble root normally.

Test renewal without waiting weeks: the fixture first obtains a genuine six-day
certificate from Pebble's shortlived profile in the **disposable edge volume**.
The unchanged worker must notice its expiry and obtain a renewed certificate:

```sh
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml cp tests/edge/renew.mjs edge:/tmp/renew.mjs
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml exec -T edge node /tmp/renew.mjs
```

Then test management ACLs and forwarded-header spoofing:

```sh
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml -f tests/edge/acl.override.yaml up -d --wait edge
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml run --rm --no-deps --entrypoint node runner /fixtures/acl.mjs
```

Remove only this disposable stack and its volumes after testing:

```sh
docker compose --env-file /tmp/mcph-edge-test/test.env -f compose.prod.yaml -f tests/edge/compose.test.yaml down -v
```

Run on a clean test database. The fixed private subnet 10.77.42.0/24 must be unused.
Provider API semantics are covered by upstream lego; live calls to all six providers
are not performed here. Ordinary unit tests additionally cover malformed IP/CIDR
input, reserved/IDN domains, retry deadlines, renewal failures and mixed A/AAAA answers.
