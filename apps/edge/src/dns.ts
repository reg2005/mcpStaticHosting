import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

export interface Addresses { ipv4: string | null; ipv6: string | null }
export interface DnsResult { ipv4: string[]; ipv6: string[] }

export function matchesInstance(records: DnsResult, instance: Addresses): boolean {
  // All answers must reach this instance; a stray AAAA breaks HTTP-01 for some CAs.
  return !!instance.ipv4 && records.ipv4.length > 0
    && records.ipv4.every((ip) => ip === instance.ipv4)
    && records.ipv6.every((ip) => instance.ipv6 !== null && normalizeV6(ip) === normalizeV6(instance.ipv6));
}
function normalizeV6(ip: string) { return new URL(`http://[${ip}]/`).hostname; }

export async function lookupDomain(hostname: string, servers: string[]): Promise<DnsResult> {
  const resolver = new Resolver({ timeout: 4000, tries: 2 });
  resolver.setServers(servers);
  async function resolve(type: "A" | "AAAA") {
    try { return type === "A" ? await resolver.resolve4(hostname) : await resolver.resolve6(hostname); }
    catch (e) {
      if (["ENODATA", "ENOTFOUND"].includes((e as NodeJS.ErrnoException).code ?? "")) return [];
      throw e;
    }
  }
  const [ipv4, ipv6] = await Promise.all([resolve("A"), resolve("AAAA")]);
  return { ipv4, ipv6 };
}

/** Use independent HTTPS reflectors; never infer ingress from a container's private IP. */
export async function discoverIpv4(): Promise<string> {
  const answers = await Promise.all(["https://api.ipify.org", "https://checkip.amazonaws.com"].map(async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("IP discovery failed");
    const ip = (await response.text()).trim();
    if (isIP(ip) !== 4) throw new Error("IP discovery returned no IPv4");
    return ip;
  }));
  if (answers[0] !== answers[1]) throw new Error("IP discovery disagrees; configure PUBLIC_IPV4");
  return answers[0]!;
}
