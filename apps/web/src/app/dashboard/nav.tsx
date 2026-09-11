"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function DashboardNav() {
  const router = useRouter();
  return (
    <nav style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
      <Link href="/dashboard/settings/tokens" style={{ color: "#60a5fa" }}>
        MCP tokens
      </Link>
      <button
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
        style={{ background: "transparent", border: "none", color: "#9aa3ad", cursor: "pointer" }}
      >
        Sign out
      </button>
    </nav>
  );
}
