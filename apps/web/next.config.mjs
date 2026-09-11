import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // These workspace packages ship as TypeScript source; let Next transpile them.
  transpilePackages: ["@mcphosting/core", "@mcphosting/db", "@mcphosting/auth"],
  serverExternalPackages: ["simple-git", "postgres"],
  webpack: (config) => {
    // Our packages use NodeNext-style ".js" import specifiers that actually
    // resolve to ".ts" source — teach webpack to follow them.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
