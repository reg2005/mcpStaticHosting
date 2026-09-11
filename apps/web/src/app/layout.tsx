import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "MCP Static Hosting",
  description: "Your AI agent ships a website over MCP — versioned, hosted, live. Self-hosted static sites for AI agents.",
};

// Critical for mobile: render at device width instead of a zoomed-out desktop.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#0b0d10",
          color: "#e6e8eb",
        }}
      >
        {children}
      </body>
    </html>
  );
}
