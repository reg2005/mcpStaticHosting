import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../apps/edge/src/config.ts";
import { legoArgs } from "../apps/edge/src/acme.ts";
import { nginxConfig } from "../apps/edge/src/nginx.ts";
import { parseSystemPath, readRoutingMode, systemPath, inSiteRedirect } from "../packages/core/src/site-routing.ts";
import { ProjectService } from "../packages/core/src/project-service.ts";
import type { Db } from "../packages/db/src/index.ts";

test("path mode accepts no DNS provider; unknown modes fail closed", () => {
  const config = readConfig({ MAIN_DOMAIN: "example.com", ACME_EMAIL: "admin@example.com", SITE_ROUTING_MODE: "path" });
  assert.equal(config.routingMode, "path");
  assert.ok(legoArgs(config, config.main, false, false).includes("--force-cert-domains"));
  assert.throws(() => readRoutingMode("paths"));
  assert.throws(() => readConfig({ MAIN_DOMAIN: "example.com", ACME_EMAIL: "admin@example.com" }));
});

test("path URLs separate owners and preview, and end in a slash", () => {
  const service = new ProjectService({} as Db, { baseDomain: "example.com", mainDomain: "example.com", routingMode: "path", repoRoot: "/tmp/repos", snapshotRoot: "/tmp/snapshots" });
  assert.deepEqual(service.hostsFor("hello", "abc12345"), {
    productionUrl: "https://example.com/sites/hello-abc12345/",
    previewUrl: "https://example.com/preview/hello-abc12345/",
  });
  assert.notEqual(systemPath({ slug: "hello", userShortId: "abc12345" }), systemPath({ slug: "hello", userShortId: "def12345" }));
  const parsed = parseSystemPath("/preview/hello-abc12345/assets/main.css");
  assert.equal(parsed?.isPreview, true);
  assert.equal(parsed?.basePath, "/preview/hello-abc12345/");
  assert.equal(parsed?.sitePath, "/assets/main.css");
  for (const path of ["/dashboard", "/sites/", "/sites/a/", "/sites/a%2fb-abc12345/", "/sites/hello-abc12345/../other/", "/sites/hello-abc12345/%2e%2e/x", "/sites/hello-abc12345/%5cx"]) assert.equal(parseSystemPath(path), null);
});

test("password redirects remain within the current project prefix", () => {
  const base = "/sites/hello-abc12345/";
  assert.equal(inSiteRedirect("/about?q=1", base), base + "about?q=1");
  for (const next of ["//evil.test", "/../dashboard", "/%2e%2e/dashboard", "/__mcphosting/unlock", "/\\evil.test"]) assert.equal(inSiteRedirect(next, base), base);
});

test("path proxy exempts hosted paths from management ACL and strips management cookies", () => {
  const config = readConfig({ MAIN_DOMAIN: "example.com", ACME_EMAIL: "admin@example.com", SITE_ROUTING_MODE: "path", MANAGEMENT_ALLOWED_CIDRS: "192.0.2.0/24" });
  const rendered = nginxConfig(config, true, ["adas.com"]);
  assert.ok(rendered.includes("location ^~ /sites/"));
  assert.ok(rendered.includes("location ^~ /preview/"));
  assert.ok(rendered.includes('proxy_set_header Cookie "mcphosting_access=$cookie_mcphosting_access";'));
  assert.ok(!rendered.includes("server_name ~^"));
  assert.equal(rendered.match(/deny all/g)?.length, 2);
  const initial = nginxConfig(config, false, []);
  assert.equal(initial.match(/location \^~ \/\.well-known\/acme-challenge\//g)?.length, 2);
});
