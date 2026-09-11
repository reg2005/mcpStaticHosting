"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { McpConfig } from "./mcp-config";

interface KeyRow {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string | Date;
}

export default function TokensPage({ mcpUrl }: { mcpUrl: string }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data } = await authClient.apiKey.list();
    setKeys(data?.apiKeys ?? []);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    setBusy(true);
    const { data } = await authClient.apiKey.create({ name: name || "mcp" });
    setBusy(false);
    setName("");
    if (data?.key) setFresh(data.key);
    void refresh();
  }

  async function remove(id: string) {
    await authClient.apiKey.delete({ keyId: id });
    void refresh();
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(24px, 6vw, 48px) 20px" }}>
      <Link href="/dashboard" style={{ color: "#60a5fa", fontSize: 13 }}>← dashboard</Link>
      <h1 style={{ fontSize: 26 }}>MCP tokens</h1>
      <p style={{ color: "#9aa3ad" }}>
        Use a token in your agent (Codex / Claude / opencode) to build sites over MCP.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="token name"
          style={{ flex: "1 1 200px", minWidth: 0, background: "#11151a", border: "1px solid #1f242b", borderRadius: 8, padding: "8px 12px", color: "#e6e8eb" }}
        />
        <button onClick={create} disabled={busy} style={{ background: "#3b82f6", border: "none", borderRadius: 8, padding: "8px 16px", color: "white", fontWeight: 600, cursor: "pointer" }}>
          {busy ? "…" : "Create token"}
        </button>
      </div>

      {fresh && <McpConfig token={fresh} mcpUrl={mcpUrl} />}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {keys.map((k) => (
          <li key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #1f242b", borderRadius: 8, padding: "10px 14px" }}>
            <span>
              <strong>{k.name ?? "token"}</strong>{" "}
              <code style={{ color: "#9aa3ad", fontSize: 12 }}>{k.start ? `${k.start}…` : ""}</code>
            </span>
            <button onClick={() => remove(k.id)} style={{ background: "transparent", border: "1px solid #3a2326", color: "#f87171", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
