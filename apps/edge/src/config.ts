import { isIP } from "node:net";
import { isValidHostname, readRoutingMode } from "@mcphosting/core";

export function parseCidrs(input: string): string[] {
  if (!input.trim()) return [];
  return input.split(/[\s,]+/).filter(Boolean).map((entry) => {
    const [address, prefix, extra] = entry.split("/");
    const family = isIP(address ?? "");
    if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error("MANAGEMENT_ALLOWED_CIDRS содержит некорректный IP или подсеть");
    }
    return entry;
  });
}

export function readConfig(env: NodeJS.ProcessEnv) {
  const main = (env.MAIN_DOMAIN ?? "").toLowerCase();
  if (!isValidHostname(main)) throw new Error("Укажите корректный MAIN_DOMAIN");
  const email = env.ACME_EMAIL ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Укажите ACME_EMAIL");
  const routingMode = readRoutingMode(env.SITE_ROUTING_MODE);
  const provider = env.DNS_PROVIDER ?? "";
  if (routingMode === "subdomain" && (!/^[a-z0-9]+$/.test(provider) || provider === "exec" || provider === "manual")) throw new Error("Укажите DNS_PROVIDER с автоматической поддержкой DNS API");
  for (const [key, family] of [["PUBLIC_IPV4", 4], ["PUBLIC_IPV6", 6]] as const) {
    if (env[key] && isIP(env[key]!) !== family) throw new Error(`Некорректный ${key}`);
  }
  const server = env.ACME_SERVER ?? "https://acme-v02.api.letsencrypt.org/directory";
  if (new URL(server).protocol !== "https:") throw new Error("ACME_SERVER должен использовать HTTPS");
  const resolvers = (env.DNS_RESOLVERS ?? "1.1.1.1,8.8.8.8").split(",").map((s) => s.trim());
  if (!resolvers.length || resolvers.some((s) => !isIP(s))) throw new Error("DNS_RESOLVERS должен содержать IP DNS-серверов через запятую");
  return { routingMode, main, email, provider, server, resolvers, cidrs: parseCidrs(env.MANAGEMENT_ALLOWED_CIDRS ?? ""), credentialsFile: env.DNS_CREDENTIALS_FILE ?? "/run/secrets/dns_credentials", ipv4: env.PUBLIC_IPV4 || null, ipv6: env.PUBLIC_IPV6 || null };
}
export type EdgeConfig = ReturnType<typeof readConfig>;
