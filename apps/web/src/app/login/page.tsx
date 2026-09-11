import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const signupsEnabled = process.env.SIGNUPS_ENABLED !== "false";

export default function LoginPage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <Suspense>
        <LoginForm signupsEnabled={signupsEnabled} />
      </Suspense>
    </main>
  );
}
