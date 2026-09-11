import type { CSSProperties } from "react";

export const authCard: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "min(320px, 92vw)",
  padding: 28,
  border: "1px solid #1f242b",
  borderRadius: 12,
  background: "#11151a",
};

export const authInput: CSSProperties = {
  background: "#0b0d10",
  border: "1px solid #1f242b",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#e6e8eb",
  fontSize: 14,
};

export const authButton: CSSProperties = {
  background: "#3b82f6",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
};
