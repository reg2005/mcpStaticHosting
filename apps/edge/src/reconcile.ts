import type { Domain } from "@mcphosting/db";
import { retryDelay } from "./acme.js";
import { type Addresses, type DnsResult, matchesInstance } from "./dns.js";

export interface DomainAdapters {
  lookup(host: string): Promise<DnsResult>;
  certificate(host: string): Promise<{ valid: boolean; renew: boolean }>;
  issue(host: string, renew: boolean): Promise<void>;
}

/** One retryable job. The database stores both outcomes and retry deadlines. */
export async function reconcileDomain(row: Domain, addresses: Addresses, adapters: DomainAdapters, now = new Date()) {
  const checked = { lastCheckedAt: now };
  if (!addresses.ipv4) return { ...checked, verified: false, tls: "pending" as const, dnsStatus: "pending", lastError: "Внешний IP сервера пока не определён." };
  let records: DnsResult;
  try { records = await adapters.lookup(row.hostname); }
  catch { return { ...checked, lastError: "DNS-сервер временно недоступен. Проверка повторится автоматически." }; }
  if (!matchesInstance(records, addresses)) return {
    ...checked, verified: false, tls: "pending" as const, dnsStatus: "pending",
    lastError: `Ожидается A-запись на ${addresses.ipv4}. Удалите адреса других серверов и неподходящие AAAA-записи.`,
  };
  let cert = await adapters.certificate(row.hostname);
  let attempted = false;
  if ((!cert.valid || cert.renew) && row.nextAttemptAt <= now) {
    attempted = true;
    try { await adapters.issue(row.hostname, cert.valid); cert = await adapters.certificate(row.hostname); }
    catch {
      return { ...checked, verified: true, dnsStatus: "matched", tls: cert.valid ? "active" as const : "failed" as const,
        attempts: row.attempts + 1, nextAttemptAt: new Date(now.getTime() + retryDelay(row.attempts)),
        lastError: "Не удалось выпустить или продлить сертификат. Проверьте доступность порта 80, CAA и лимиты Let's Encrypt. Повторная попытка запланирована." };
    }
  }
  return { ...checked, verified: true, dnsStatus: "matched", tls: cert.valid ? "active" as const : "pending" as const,
    ...(cert.valid && !cert.renew ? { attempts: 0, nextAttemptAt: now, lastError: null } : {}),
    // A CA can defer renewal via ARI. Keep that retry deadline fixed between attempts.
    ...(cert.valid && cert.renew && attempted ? { attempts: 0, nextAttemptAt: new Date(now.getTime() + 3600000), lastError: null } : {}),
  };
}
