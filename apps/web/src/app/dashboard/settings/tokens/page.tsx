import TokensPage from "./tokens-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return <TokensPage mcpUrl={process.env.MCP_PUBLIC_URL ?? "http://localhost:3001/mcp"} />;
}
