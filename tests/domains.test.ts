import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCustomDomain, DomainError } from "../packages/core/src/domain-policy.ts";
import { previewHost, productionHost } from "../packages/core/src/hostnames.ts";
import { slugify } from "../packages/core/src/ids.ts";
import { parseCidrs, readConfig } from "../apps/edge/src/config.ts";
import { matchesInstance } from "../apps/edge/src/dns.ts";
import { legoArgs, retryDelay } from "../apps/edge/src/acme.ts";
import { nginxConfig } from "../apps/edge/src/nginx.ts";
import { reconcileDomain } from "../apps/edge/src/reconcile.ts";
import type { Domain } from "../packages/db/src/schema.ts";

test("only external bare domains are accepted, including IDN and case normalization", () => {
  assert.equal(validateCustomDomain("Adas.com.", "example.com"), "adas.com");
  assert.equal(validateCustomDomain("пример.рф", "example.com"), "xn--e1afmkfd.xn--p1ai");
  for (const input of ["example.com", "sdfsd.example.com", "deep.sub.example.com", "EXAMPLE.COM."]) {
    assert.throws(() => validateCustomDomain(input, "example.com"), (e: unknown) => e instanceof DomainError && e.code === "RESERVED_DOMAIN");
  }
  for (const input of ["https://adas.com", "adas.com:80", "*.adas.com", "x;include evil;", "a.com\nx.com", "127.0.0.1", "-d.evil.com", "a.com/path"]) assert.throws(() => validateCustomDomain(input, "example.com"));
  assert.equal(validateCustomDomain("notexample.com", "example.com"), "notexample.com");
});

test("system hosts fit one wildcard label and preview namespace cannot collide", () => {
  const slug = slugify("x".repeat(200));
  const parts = { slug, userShortId: "abc12345" };
  assert.ok(previewHost(parts, "example.com").split(".")[0]!.length <= 63);
  assert.ok(productionHost(parts, "example.com").split(".")[0]!.length <= 63);
  assert.notEqual(productionHost({ ...parts, slug: slugify("preview--hello") }, "example.com"), previewHost({ ...parts, slug: "hello" }, "example.com"));
});

test("CIDR list accepts IPv4 and IPv6, empty is unrestricted, invalid input fails closed", () => {
  assert.deepEqual(parseCidrs("  "), []);
  assert.deepEqual(parseCidrs("192.0.2.0/24, 2001:db8::/32 198.51.100.5"), ["192.0.2.0/24", "2001:db8::/32", "198.51.100.5"]);
  for (const entry of ["all", "0.0.0.0/33", "::/129", "127.0.0.1/", "127.0.0.1/8/foo", "127.0.0.1;allow all"]) assert.throws(() => parseCidrs(entry));
});

test("DNS must route every A and AAAA answer to this instance", () => {
  const instance = { ipv4: "203.0.113.1", ipv6: null };
  assert.equal(matchesInstance({ ipv4: ["203.0.113.1"], ipv6: [] }, instance), true);
  for (const records of [{ ipv4: [], ipv6: [] }, { ipv4: ["203.0.113.1", "203.0.113.2"], ipv6: [] }, { ipv4: ["203.0.113.1"], ipv6: ["2001:db8::1"] }]) assert.equal(matchesInstance(records, instance), false);
  assert.equal(matchesInstance({ ipv4: ["203.0.113.1"], ipv6: ["2001:db8:0:0::1"] }, { ...instance, ipv6: "2001:db8::1" }), true);
});

const config = readConfig({ MAIN_DOMAIN: "example.com", ACME_EMAIL: "admin@example.com", DNS_PROVIDER: "selectelv2" });
test("ACME wildcard uses DNS-01; custom domain uses only HTTP-01 on webroot", () => {
  const wildcard = legoArgs(config, "example.com", true, false);
  assert.equal(wildcard[0], "run");
  assert.ok(wildcard.includes("*.example.com")); assert.ok(wildcard.includes("selectelv2")); assert.ok(!wildcard.includes("--http"));
  const custom = legoArgs(config, "adas.com", false, true);
  assert.ok(custom.includes("--http.webroot")); assert.ok(!custom.includes("--dns")); assert.ok(!custom.includes("--tls"));
  assert.equal(retryDelay(100), 3600000);
});

test("nginx fails closed before wildcard, protects management only and discards forwarded IPs", () => {
  const initial = nginxConfig(config, false, []);
  assert.ok(initial.includes("ssl_reject_handshake on")); assert.ok(initial.includes("/.well-known/acme-challenge/")); assert.ok(!initial.includes("proxy_pass"));
  const active = nginxConfig({ ...config, cidrs: ["192.0.2.0/24"] }, true, ["adas.com"]);
  assert.equal(active.match(/deny all/g)?.length, 2);
  assert.ok(active.includes("X-Forwarded-For $remote_addr")); assert.ok(!active.includes("$http_x_forwarded_for"));
  assert.ok(active.includes("server_name adas.com")); assert.ok(!nginxConfig(config, true, []).includes("deny all"));
});

const now = new Date("2026-09-11T00:00:00Z");
const row = { id: "claim-1", hostname: "adas.com", attempts: 0, nextAttemptAt: now, verified: false, tls: "pending" } as Domain;
const addresses = { ipv4: "203.0.113.1", ipv6: null };
test("DNS mismatch never requests a certificate; matching DNS issues and activates", async () => {
  let requests = 0; let valid = false;
  const adapters = { lookup: async () => ({ ipv4: ["203.0.113.2"], ipv6: [] }), certificate: async () => ({ valid, renew: !valid }), issue: async () => { requests++; valid = true; } };
  assert.equal((await reconcileDomain(row, addresses, adapters, now)).verified, false); assert.equal(requests, 0);
  adapters.lookup = async () => ({ ipv4: [addresses.ipv4], ipv6: [] });
  const result = await reconcileDomain(row, addresses, adapters, now);
  assert.equal(result.tls, "active"); assert.equal(result.verified, true); assert.equal(requests, 1);
});
test("ACME errors persist a retry deadline, retain valid cert during renewal, and expired certs stop serving", async () => {
  let requests = 0;
  const adapters = { lookup: async () => ({ ipv4: [addresses.ipv4], ipv6: [] }), certificate: async () => ({ valid: false, renew: true }), issue: async () => { requests++; throw new Error("secret-provider-message"); } };
  const failed = await reconcileDomain(row, addresses, adapters, now);
  assert.equal(failed.tls, "failed"); assert.equal(failed.attempts, 1); assert.ok(!failed.lastError?.includes("secret-provider-message"));
  await reconcileDomain({ ...row, ...failed }, addresses, adapters, now); assert.equal(requests, 1);
  adapters.certificate = async () => ({ valid: true, renew: true });
  assert.equal((await reconcileDomain(row, addresses, adapters, now)).tls, "active");
});
test("DNS outage does not revoke a healthy route; changed DNS does", async () => {
  const adapters = { lookup: async (): Promise<{ ipv4: string[]; ipv6: string[] }> => { throw new Error("timeout"); }, certificate: async () => ({ valid: true, renew: false }), issue: async () => {} };
  const live = { ...row, verified: true, tls: "active" as const };
  assert.equal((await reconcileDomain(live, addresses, adapters, now)).verified, undefined);
  adapters.lookup = async () => ({ ipv4: ["203.0.113.2"], ipv6: [] });
  assert.equal((await reconcileDomain(live, addresses, adapters, now)).verified, false);
});
test("renewal waiting does not slide its retry deadline on each DNS check", async () => {
  let attempts=0;
  const adapters={lookup:async()=>({ipv4:[addresses.ipv4],ipv6:[]}),certificate:async()=>({valid:true,renew:true}),issue:async()=>{attempts++;}};
  const waiting={...row,nextAttemptAt:new Date(now.getTime()+3600000)};
  const update=await reconcileDomain(waiting,addresses,adapters,now);
  assert.equal(attempts,0);assert.equal(update.nextAttemptAt,undefined);
  const due=await reconcileDomain(waiting,addresses,adapters,new Date(now.getTime()+3600001));
  assert.equal(attempts,1);assert.ok(due.nextAttemptAt);
});
