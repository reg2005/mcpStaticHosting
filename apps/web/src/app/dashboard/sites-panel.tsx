"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export interface SiteItem {
  id: string;
  name: string;
  slug: string;
  passwordProtected: boolean;
  productionUrl: string;
  previewUrl: string;
}

export function SitesPanel({ projects }: { projects: SiteItem[] }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    );
  }, [projects, query]);

  return (
    <>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "clamp(22px, 6vw, 28px)", margin: 0 }}>Your sites</h1>
        <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 220 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#6b7280",
                fontSize: 13,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites"
              aria-label="Search sites"
              style={{
                width: "100%",
                background: "#11151a",
                border: "1px solid #1f242b",
                borderRadius: 8,
                padding: "8px 12px 8px 34px",
                color: "#e6e8eb",
              }}
            />
          </div>
          <button onClick={() => setCreating(true)} style={primaryBtn}>
            New site
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <p style={{ color: "#9aa3ad" }}>No sites yet. Create one above or via your MCP agent.</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#9aa3ad" }}>No sites match “{query}”.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {filtered.map((p) => (
            <li
              key={p.id}
              style={{
                border: "1px solid #1f242b",
                borderRadius: 10,
                padding: 16,
                background: "#11151a",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <strong style={{ fontSize: 18 }}>{p.name}</strong>
                  {p.passwordProtected ? (
                    <span style={badge("#374151", "#e6e8eb")}>🔒 Password-protected</span>
                  ) : (
                    <span style={badge("#14321f", "#4ade80")}>🔓 Public — no password</span>
                  )}
                </span>
                <Link href={`/dashboard/${p.id}`} style={{ color: "#60a5fa", whiteSpace: "nowrap" }}>
                  Open editor →
                </Link>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#9aa3ad" }}>
                <div>
                  prod:{" "}
                  <a href={p.productionUrl} style={{ color: "#9aa3ad", wordBreak: "break-all" }}>
                    {p.productionUrl}
                  </a>
                </div>
                <div>
                  preview:{" "}
                  <a href={p.previewUrl} style={{ color: "#9aa3ad", wordBreak: "break-all" }}>
                    {p.previewUrl}
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && <NewSiteModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewSiteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create site");
        return;
      }
      router.push(`/dashboard/${data.id}`);
    } catch {
      setError("Failed to create site");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 50,
      }}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={create}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#11151a",
          border: "1px solid #1f242b",
          borderRadius: 12,
          padding: 24,
          display: "grid",
          gap: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>New site</h2>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#9aa3ad" }}>
          Site name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My site (optional)"
            style={{
              background: "#0b0d10",
              border: "1px solid #1f242b",
              borderRadius: 8,
              padding: "10px 12px",
              color: "#e6e8eb",
              fontSize: 14,
            }}
          />
        </label>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
          Leave it blank to get a random name — you can rename it anytime in the editor.
        </p>
        {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={ghostBtn} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={primaryBtn} disabled={busy}>
            {busy ? "Creating…" : "Create site"}
          </button>
        </div>
      </form>
    </div>
  );
}

const primaryBtn: CSSProperties = {
  background: "#3b82f6",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ghostBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid #1f242b",
  borderRadius: 8,
  padding: "8px 16px",
  color: "#e6e8eb",
  fontWeight: 600,
  cursor: "pointer",
};

function badge(bg: string, color: string): CSSProperties {
  return {
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  };
}
