"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { authCard, authInput, authButton } from "../auth-ui";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await signUp.email({ name, email, password });
    setBusy(false);
    if (error) return setError(error.message ?? "Sign-up failed");
    router.push("/dashboard");
  }

  return (
    <form onSubmit={submit} style={authCard}>
      <h1 style={{ fontSize: 24, margin: 0 }}>Create account</h1>
      <input style={authInput} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input style={authInput} type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={authInput} type="password" placeholder="password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
      <button style={authButton} disabled={busy}>{busy ? "…" : "Sign up"}</button>
      <p style={{ fontSize: 13, color: "#9aa3ad" }}>
        Have an account? <Link href="/login" style={{ color: "#60a5fa" }}>Sign in</Link>
      </p>
    </form>
  );
}
