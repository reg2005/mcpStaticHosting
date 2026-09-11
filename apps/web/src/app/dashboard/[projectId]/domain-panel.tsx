"use client";
import { useCallback, useEffect, useState } from "react";

type Domain = { hostname: string; dnsStatus: string; tls: string; lastError: string | null; lastCheckedAt: string | null };
export function DomainPanel({ projectId, productionUrl, onSystemChange }: { projectId: string; productionUrl: string; onSystemChange: (enabled: boolean) => void }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [ip, setIp] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const endpoint = `/api/projects/${projectId}/domains`;
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error("Не удалось загрузить домены.");
      const body = await res.json();
      setDomains(body.domains); setEnabled(body.systemDomainEnabled); onSystemChange(body.systemDomainEnabled);
      setIp(body.setup.publicIpv4); setError("");
    } catch { setError("Не удалось загрузить домены. Повторите попытку."); }
    finally { setLoading(false); }
  }, [endpoint, onSystemChange]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 15000); return () => clearInterval(timer); }, [refresh]);
  async function change(method: string, body: object) {
    setBusy(true); setError(""); setFieldError("");
    try {
      const res = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors?.[0]?.field === "hostname") setFieldError(data.errors[0].message);
        else setError(data.errors?.[0]?.message ?? data.message ?? "Не удалось сохранить изменение.");
        return;
      }
      if (method === "POST") setHostname("");
      await refresh();
    } catch { setError("Сервер недоступен. Повторите попытку."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Домены" style={{ padding: 12, fontSize: 12, borderTop: "1px solid var(--border)", overflowWrap: "anywhere" }}>
    <h3 style={{ margin: "0 0 10px" }}>Домены и HTTPS</h3>
    {loading ? <p>Загрузка…</p> : <>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => void change("PATCH", { systemDomainEnabled: e.target.checked })} />Системный адрес</label>
      <p>{productionUrl}</p>
      <p style={{ color: "var(--muted)" }}>{enabled ? "Адрес сайта и preview включены." : "Адрес сайта и preview выключены. Собственные домены продолжают работать."}</p>
      <form onSubmit={(e) => { e.preventDefault(); void change("POST", { hostname }); }}>
        <label htmlFor="custom-domain">Собственный домен</label>
        <input id="custom-domain" value={hostname} required maxLength={253} placeholder="your-domain.com" onChange={(e) => setHostname(e.target.value)} aria-invalid={!!fieldError} aria-describedby={fieldError ? "domain-error" : undefined} style={{ width: "100%", boxSizing: "border-box", margin: "6px 0", padding: 8, color: "inherit", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6 }} />
        {fieldError && <p id="domain-error" role="alert" style={{ color: "#f87171" }}>{fieldError}</p>}
        <button type="submit" disabled={busy}>{busy ? "Сохранение…" : "Добавить домен"}</button>
      </form>
      <p>{ip ? <>A-запись для своего домена: <strong>{ip}</strong></> : "Внешний IP определяется. Если ожидание затянулось, обратитесь к администратору."}</p>
      {domains.length === 0 && <p>Собственных доменов пока нет.</p>}
      {domains.map((domain) => <div key={domain.hostname} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
        <strong>{domain.hostname}</strong>
        <p>{domain.dnsStatus !== "matched" ? "Ожидается DNS" : domain.tls === "active" ? "HTTPS подключён" : domain.tls === "failed" ? "Повторная попытка выпуска HTTPS" : "Выпускается HTTPS"}</p>
        {ip && <code>A {domain.hostname} → {ip}</code>}
        {domain.lastError && <p>{domain.lastError}</p>}
        {domain.lastCheckedAt && <p style={{ color: "var(--muted)" }}>Проверено: {new Date(domain.lastCheckedAt).toLocaleTimeString()}</p>}
        <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Отключить ${domain.hostname}?`)) void change("DELETE", { hostname: domain.hostname }); }}>Удалить</button>
      </div>)}
    </>}
    {error && <p role="alert" style={{ color: "#f87171" }}>{error} <button type="button" onClick={() => void refresh()}>Повторить</button></p>}
  </section>;
}
