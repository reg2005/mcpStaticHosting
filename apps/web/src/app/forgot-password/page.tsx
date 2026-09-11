"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authCard, authInput, authButton } from "../auth-ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setBusy(false);
    if (error) return setError(error.message ?? "Request failed");
    setSent(true);
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      {sent ? (
        <div style={authCard}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Check your email</h1>
          <p style={{ fontSize: 14, color: "#9aa3ad", margin: 0 }}>
            If an account exists for {email}, a password-reset link is on its way.
          </p>
          <Link href="/login" style={{ color: "#60a5fa", fontSize: 13 }}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} style={authCard}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Reset password</h1>
          <p style={{ fontSize: 13, color: "#9aa3ad", margin: 0 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <input
            style={authInput}
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
          <button style={authButton} disabled={busy}>
            {busy ? "…" : "Send reset link"}
          </button>
          <p style={{ fontSize: 13, color: "#9aa3ad" }}>
            Remembered it?{" "}
            <Link href="/login" style={{ color: "#60a5fa" }}>
              Sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
