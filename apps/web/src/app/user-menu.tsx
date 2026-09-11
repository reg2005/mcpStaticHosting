"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

/** Top-right account chip: click the email to reveal a Sign out button. */
export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          maxWidth: "60vw",
          background: "#11151a",
          border: "1px solid #1f242b",
          borderRadius: 999,
          padding: "6px 14px",
          color: "#e6e8eb",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {email}
        </span>
        <span style={{ color: "#6b7280", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#11151a",
            border: "1px solid #1f242b",
            borderRadius: 8,
            padding: 4,
            minWidth: 160,
            zIndex: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={async () => {
              await signOut();
              router.refresh();
            }}
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              padding: "8px 12px",
              color: "#e6e8eb",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
