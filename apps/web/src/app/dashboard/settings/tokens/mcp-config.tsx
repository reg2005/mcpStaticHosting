"use client";

import { useState } from "react";



type AgentId = "claude" | "codex" | "opencode";

interface Agent {
  id: AgentId;
  label: string;
  file: string;
  build: (token: string, mcpUrl: string) => string;
}

const AGENTS: Agent[] = [
  {
    id: "claude",
    label: "Claude Code",
    file: ".mcp.json",
    build: (token, mcpUrl) =>
      JSON.stringify(
        {
          mcpServers: {
            mcphosting: {
              type: "http",
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "codex",
    label: "Codex",
    file: "~/.codex/config.toml",
    build: (token, mcpUrl) =>
      ["[mcp_servers.mcphosting]", `url = "${mcpUrl}"`, `http_headers = { Authorization = "Bearer ${token}" }`].join("\n"),
  },
  {
    id: "opencode",
    label: "opencode",
    file: "opencode.json",
    build: (token, mcpUrl) =>
      JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          mcp: {
            mcphosting: {
              type: "remote",
              url: mcpUrl,
              enabled: true,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
  },
];

export function McpConfig({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  const [active, setActive] = useState<AgentId>("claude");
  const [copied, setCopied] = useState(false);

  const agent = AGENTS.find((a) => a.id === active)!;
  const code = agent.build(token, mcpUrl);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ border: "1px solid #16a34a", borderRadius: 10, padding: 16, marginBottom: 16, background: "#0f1a12" }}>
      <p style={{ margin: "0 0 10px", fontSize: 13 }}>
        Copy it now — the token won&apos;t be shown again. Pick your agent and paste its config:
      </p>

      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setActive(a.id)}
            style={{
              background: a.id === active ? "#1f242b" : "transparent",
              border: "1px solid #1f242b",
              borderBottom: a.id === active ? "1px solid #3b82f6" : "1px solid #1f242b",
              color: a.id === active ? "#e6e8eb" : "#9aa3ad",
              padding: "6px 14px",
              borderRadius: "6px 6px 0 0",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: a.id === active ? 600 : 400,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <code style={{ fontSize: 12, color: "#9aa3ad" }}>{agent.file}</code>
        <button
          onClick={copy}
          style={{ background: copied ? "#16a34a" : "#3b82f6", border: "none", borderRadius: 6, padding: "4px 12px", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <pre style={{ overflowX: "auto", fontSize: 12, background: "#0b0d10", padding: 12, borderRadius: 8, margin: 0 }}>{code}</pre>
    </div>
  );
}
