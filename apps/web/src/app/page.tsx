import Link from "next/link";
import { getOptionalUser } from "@/lib/session";
import { UserMenu } from "./user-menu";

export const dynamic = "force-dynamic";

const features = [
  ["Build over MCP", "Point Codex, Claude, or opencode at mcphosting and your agent writes files, previews, and ships — no dashboard required."],
  ["Versioned by default", "Every publish is an immutable snapshot. Preview the draft, ship to production, roll back in one call."],
  ["Self-hosted", "Run on your own server with Docker Compose. Configure your own domains, keep your files, and control access."],
];

const signupsEnabled = process.env.SIGNUPS_ENABLED !== "false";

export default async function Home() {
  const user = await getOptionalUser();

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(56px, 12vw, 96px) 20px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontSize: 13,
            color: "#9aa3ad",
            border: "1px solid #1f242b",
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          MCP Static Hosting
        </div>
        {user && <UserMenu email={user.email} />}
      </div>

      <h1 style={{ fontSize: "clamp(32px, 8vw, 52px)", lineHeight: 1.05, margin: 0, fontWeight: 800 }}>
        From an idea to a live website.
        <br />
        <span style={{ color: "#60a5fa" }}>Built by your AI agent.</span>
      </h1>

      <p style={{ fontSize: "clamp(16px, 4vw, 20px)", color: "#9aa3ad", lineHeight: 1.5, marginTop: 20, maxWidth: 640 }}>
        Your AI agent ships a website over MCP — plain HTML, single- or multi-page, with optional
        backend functions. Versioned, hosted, live on its own subdomain.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
        {user ? (
          <Link href="/dashboard" style={cta("#3b82f6", "white")}>
            Open dashboard →
          </Link>
        ) : (
          <>
            {signupsEnabled && (
              <Link href="/signup" style={cta("#3b82f6", "white")}>
                Get started →
              </Link>
            )}
            <Link
              href="/login"
              style={cta(
                signupsEnabled ? "transparent" : "#3b82f6",
                signupsEnabled ? "#e6e8eb" : "white",
                signupsEnabled ? "1px solid #1f242b" : "none",
              )}
            >
              Sign in
            </Link>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 64 }}>
        {features.map(([title, body]) => (
          <div key={title} style={{ border: "1px solid #1f242b", borderRadius: 12, padding: 20, background: "#11151a" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#9aa3ad", lineHeight: 1.5 }}>{body}</p>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 48, fontSize: 13, color: "#6b7280" }}>Open source. Your infrastructure. Your websites.</p>
    </main>
  );
}

function cta(bg: string, color: string, border = "none"): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "12px 22px",
    background: bg,
    color,
    border,
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 600,
  };
}
