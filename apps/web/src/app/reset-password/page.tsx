"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authCard, authInput, authButton } from "../auth-ui";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) return setError(error.message ?? "Reset failed");
    router.push("/login");
  }

  if (linkError || !token) {
    return (
      <div style={authCard}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Link expired</h1>
        <p style={{ fontSize: 14, color: "#9aa3ad", margin: 0 }}>
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" style={{ color: "#60a5fa", fontSize: 13 }}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={authCard}>
      <h1 style={{ fontSize: 24, margin: 0 }}>Set a new password</h1>
      <input
        style={authInput}
        type="password"
        placeholder="new password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
      <button style={authButton} disabled={busy}>
        {busy ? "…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
