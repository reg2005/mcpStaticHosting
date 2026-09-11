import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { and, asc, eq, lt, or, isNull } from "drizzle-orm";
import { domains, getDb, instanceState } from "@mcphosting/db";
import { validateCustomDomain } from "@mcphosting/core";
import { acmePath, certificateState, issueCertificate, retryDelay } from "./acme.js";
import { readConfig } from "./config.js";
import { discoverIpv4, lookupDomain, type Addresses } from "./dns.js";
import { nginxConfig } from "./nginx.js";
import { reconcileDomain } from "./reconcile.js";

const exec = promisify(execFile);
const config = readConfig(process.env);
const useWildcard = config.routingMode === "subdomain";
const db = getDb();
process.umask(0o077);
for (const dir of [acmePath(config.server), "/edge/challenges", "/edge/challenges/.well-known/acme-challenge"]) await mkdir(dir, { recursive: true });
let nginx: ChildProcess | undefined;
let stopping = false;
let lastDigest = "";
let wildcard = false;
let lastCycle = Date.now();
let addresses: Addresses = { ipv4: config.ipv4, ipv6: config.ipv6 };
let lastDiscovery = 0;
let wildcardRetry = { attempts: 0, next: 0, server: config.server, identity: `${config.main}:${config.routingMode}` };
try { wildcardRetry = JSON.parse(await readFile("/edge/wildcard-retry.json", "utf8")); } catch { /* First boot. */ }
if (wildcardRetry.server !== config.server || wildcardRetry.identity !== `${config.main}:${config.routingMode}`) wildcardRetry = { attempts: 0, next: 0, server: config.server, identity: `${config.main}:${config.routingMode}` };

function log(code: string, host?: string) { console.log(JSON.stringify({ level: "info", service: "edge", code, host })); }

async function reload() {
  const rows = await db.select({ hostname: domains.hostname }).from(domains).where(and(eq(domains.type, "custom"), eq(domains.verified, true), eq(domains.tls, "active")));
  const active: string[] = [];
  const fingerprints: string[] = [];
  for (const row of rows) {
    try {
      validateCustomDomain(row.hostname, config.main);
      if ((await certificateState(row.hostname, config.server)).valid) active.push(row.hostname);
    } catch { /* Reserved or invalid rows are never written to nginx config. */ }
  }
  if (wildcard) fingerprints.push(await readFile(`${acmePath(config.server)}/certificates/${config.main}.crt`, "utf8"));
  for (const host of active) fingerprints.push(await readFile(`${acmePath(config.server)}/certificates/${host}.crt`, "utf8"));
  const content = nginxConfig(config, wildcard, active.sort());
  const digest = createHash("sha256").update(content + fingerprints.join("")).digest("hex");
  if (digest === lastDigest) return;
  await writeFile("/edge/nginx.next.conf", content);
  await exec("nginx", ["-t", "-c", "/edge/nginx.next.conf"]);
  await rename("/edge/nginx.next.conf", "/edge/nginx.conf");
  if (!nginx) {
    nginx = spawn("nginx", ["-c", "/edge/nginx.conf", "-g", "daemon off;"], { stdio: "inherit" });
    nginx.on("exit", () => { if (!stopping) process.exit(1); });
  } else await exec("nginx", ["-s", "reload", "-c", "/edge/nginx.conf"]);
  lastDigest = digest;
  log("PROXY_CONFIGURED");
}

async function reconcileWildcard() {
  let cert = await certificateState(config.main, config.server, useWildcard);
  if ((!cert.valid || cert.renew) && Date.now() >= wildcardRetry.next) {
    log(useWildcard ? "WILDCARD_ACME_START" : "MAIN_HTTP_ACME_START", config.main);
    try {
      await issueCertificate(config, config.main, useWildcard, cert.valid);
      cert = await certificateState(config.main, config.server, useWildcard);
      wildcardRetry = { attempts: 0, next: Date.now() + 3600000, server: config.server, identity: `${config.main}:${config.routingMode}` };
      log(useWildcard ? "WILDCARD_ACME_READY" : "MAIN_HTTP_ACME_READY", config.main);
    } catch {
      wildcardRetry = { attempts: wildcardRetry.attempts + 1, next: Date.now() + retryDelay(wildcardRetry.attempts), server: config.server, identity: `${config.main}:${config.routingMode}` };
      log(useWildcard ? "WILDCARD_ACME_RETRY_CHECK_DNS_CREDENTIALS" : "MAIN_HTTP_ACME_RETRY_CHECK_DNS_AND_PORT_80", config.main);
    }
    await writeFile("/edge/wildcard-retry.next.json", JSON.stringify(wildcardRetry));
    await rename("/edge/wildcard-retry.next.json", "/edge/wildcard-retry.json");
  }
  wildcard = cert.valid;
}

async function cycle() {
  let error: string | null = null;
  if (!config.ipv4 && Date.now() - lastDiscovery >= 600000) {
    try { addresses = { ipv4: await discoverIpv4(), ipv6: config.ipv6 }; }
    catch { error = "Не удалось определить внешний IPv4. Укажите PUBLIC_IPV4 или дождитесь повторной проверки."; }
    lastDiscovery = Date.now();
  }
  await reconcileWildcard();
  await reload();
  await db.insert(instanceState).values({ id: "edge", value: { ...addresses, routingMode: config.routingMode, mainTls: wildcard ? "active" : "pending", wildcardTls: useWildcard ? (wildcard ? "active" : "pending") : "disabled", error }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: instanceState.id, set: { value: { ...addresses, routingMode: config.routingMode, mainTls: wildcard ? "active" : "pending", wildcardTls: useWildcard ? (wildcard ? "active" : "pending") : "disabled", error }, updatedAt: new Date() } });
  // Bounded batch; DNS checks use timestamps independently of ACME retry backoff.
  const rows = await db.select().from(domains).where(and(eq(domains.type, "custom"), or(isNull(domains.lastCheckedAt), lt(domains.lastCheckedAt, new Date(Date.now() - 60000)))))
    .orderBy(asc(domains.lastCheckedAt), asc(domains.id)).limit(20);
  for (const row of rows) {
    if (stopping) break;
    try { validateCustomDomain(row.hostname, config.main); }
    catch {
      await db.update(domains).set({ verified: false, tls: "failed", lastError: "Домен зарезервирован платформой.", lastCheckedAt: new Date() }).where(eq(domains.id, row.id));
      continue;
    }
    const update = await reconcileDomain(row, addresses, {
      lookup: (host) => lookupDomain(host, config.resolvers),
      certificate: (host) => certificateState(host, config.server),
      issue: async (host, renew) => { log("CUSTOM_ACME_START", host); await issueCertificate(config, host, false, renew); },
    });
    // Match row id so a delete-and-reclaim during issuance cannot enable a new claim.
    await db.update(domains).set(update).where(eq(domains.id, row.id));
    lastCycle = Date.now();
    await reload();
  }
  lastCycle = Date.now();
}

wildcard = (await certificateState(config.main, config.server, useWildcard)).valid;
await reload(); // Start HTTP-01 before any ACME request; TLS defaults to handshake rejection.
const health = createServer((req, res) => {
  const alive = !!nginx && !stopping && Date.now() - lastCycle < 600000;
  res.writeHead(alive ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: alive, routingMode: config.routingMode, mainTls: wildcard ? "active" : "pending", wildcardTls: useWildcard ? (wildcard ? "active" : "pending") : "disabled" }));
});
health.listen(9080, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  stopping = true; nginx?.kill("SIGQUIT"); health.close();
  setTimeout(() => process.exit(0), 1000).unref();
});
while (!stopping) {
  try { await cycle(); } catch { log("RECONCILE_RETRY"); }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
process.exit(0);
