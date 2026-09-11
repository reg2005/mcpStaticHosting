"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth-client";
import { authButton, authCard, authInput } from "../auth-ui";

type LoginFormProps = {
  signupsEnabled: boolean;
};

export function LoginForm({ signupsEnabled }: LoginFormProps) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in? Skip the form and go straight to the destination.
  useEffect(() => {
    if (session?.user) router.replace(next);
  }, [session, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(error.message ?? "Sign-in failed");
    router.push(next);
  }

  return (
    <form onSubmit={submit} style={authCard}>
      <h1 style={{ fontSize: 24, margin: 0 }}>Sign in</h1>
      <input style={authInput} type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={authInput} type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
      <button style={authButton} disabled={busy}>{busy ? "..." : "Sign in"}</button>
      <p style={{ fontSize: 13, color: "#9aa3ad" }}>
        {signupsEnabled && (
          <>
            No account? <Link href="/signup" style={{ color: "#60a5fa" }}>Sign up</Link>
            {" · "}
          </>
        )}
        <Link href="/forgot-password" style={{ color: "#60a5fa" }}>Forgot password?</Link>
      </p>
    </form>
  );
}
