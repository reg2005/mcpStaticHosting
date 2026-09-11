import { domainToASCII } from "node:url";
import { isReservedHost, isValidHostname } from "./hostnames.js";

export class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly field = "hostname") {
    super(message);
  }
}

export function validateCustomDomain(input: string, mainDomain: string, baseDomain = mainDomain): string {
  // Accept a bare DNS name only. Reject URL syntax and config/argument injection.
  const raw = input.trim().toLowerCase().replace(/\.$/, "");
  if (/[\s/:@*?#\\]/.test(raw)) throw new DomainError("INVALID_DOMAIN", "Введите домен без протокола, порта и пути.");
  const hostname = domainToASCII(raw);
  if (!isValidHostname(hostname)) throw new DomainError("INVALID_DOMAIN", "Введите корректное доменное имя.");
  if ([mainDomain, baseDomain].some((base) => isReservedHost(hostname, base))) {
    throw new DomainError("RESERVED_DOMAIN", "Этот домен принадлежит платформе. Используйте автоматически выданный адрес или собственный домен вне MAIN_DOMAIN.");
  }
  return hostname;
}
