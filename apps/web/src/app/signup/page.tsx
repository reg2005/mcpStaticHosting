import Link from "next/link";
import { authCard } from "../auth-ui";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

// Server-side gate: when SIGNUPS_ENABLED=false, public registration is closed
// (private beta). The better-auth endpoint enforces this too — this just hides
// the form. Existing users can still sign in.
const signupsEnabled = process.env.SIGNUPS_ENABLED !== "false";

export default function SignupPage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      {signupsEnabled ? (
        <SignupForm />
      ) : (
        <div style={{ ...authCard, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Registration is closed</h1>
          <p style={{ fontSize: 14, color: "#9aa3ad", margin: 0 }}>
            mcphosting is in private beta. Sign-ups are currently disabled.
          </p>
          <Link href="/login" style={{ color: "#60a5fa", fontSize: 14 }}>
            Sign in →
          </Link>
        </div>
      )}
    </main>
  );
}
