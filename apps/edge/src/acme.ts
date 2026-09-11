import { execFile } from "node:child_process";
import { X509Certificate, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { parse } from "dotenv";
import type { EdgeConfig } from "./config.js";
const exec = promisify(execFile);

export function acmePath(server: string) { return `/edge/acme/${createHash("sha256").update(server).digest("hex").slice(0, 16)}`; }

export async function certificateState(host: string, server: string, wildcard = false) {
  try {
    const pem = await readFile(`${acmePath(server)}/certificates/${host}.crt`);
    await readFile(`${acmePath(server)}/certificates/${host}.key`);
    const cert = new X509Certificate(pem);
    const days = (new Date(cert.validTo).getTime() - Date.now()) / 86400000;
    return { valid: !!cert.checkHost(host) && (!wildcard || !!cert.checkHost(`wildcard-probe.${host}`)) && days > 0, renew: days < 30 };
  } catch { return { valid: false, renew: true }; }
}

export function legoArgs(config: EdgeConfig, host: string, wildcard: boolean, renew: boolean): string[] {
  const args = ["run", "--path", acmePath(config.server), "--server", config.server, "--email", config.email, "--accept-tos", "--domains", host];
  if (wildcard) {
    args.push("--domains", `*.${host}`, "--dns", config.provider);
    for (const resolver of config.resolvers) args.push("--dns.resolvers", `${resolver.includes(":") ? `[${resolver}]` : resolver}:53`);
  } else args.push("--http", "--http.webroot", "/edge/challenges");
  args.push("--renew-days", "30", "--no-random-sleep");
  return args;
}

export async function issueCertificate(config: EdgeConfig, host: string, wildcard: boolean, renew: boolean) {
  // No shell evaluation. Provider credentials exist only in the lego child environment.
  const credentials = wildcard ? parse(await readFile(config.credentialsFile)) : {};
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: "/edge", SSL_CERT_FILE: process.env.SSL_CERT_FILE };
  for (const [key, value] of Object.entries(credentials)) {
    if (/^[A-Z][A-Z0-9_]*$/.test(key) && !["PATH", "HOME", "LD_PRELOAD", "LD_LIBRARY_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR"].includes(key)) env[key] = value;
  }
  // Provider output may contain credentials in URLs. Never relay it to clients/logs.
  try { await exec("lego", legoArgs(config, host, wildcard, renew), { env, timeout: 180000, maxBuffer: 1024 * 1024 }); }
  catch { throw new Error("ACME_FAILED"); }
}

export function retryDelay(attempts: number): number { return Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6)); }
