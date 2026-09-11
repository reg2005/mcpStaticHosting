import { createServer } from "node:http";
import next from "next";

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.WEB_PORT || process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function forwardedIp(req) {
  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return firstHeaderValue(req.headers["x-real-ip"]) || req.socket?.remoteAddress || "";
}

function requestPath(req) {
  try {
    return new URL(req.url || "/", "http://local").pathname;
  } catch {
    return "/";
  }
}

function accessLog(req, res, startedAt) {
  const durationMs = Date.now() - startedAt;
  const entry = {
    ts: new Date().toISOString(),
    method: req.method || "",
    path: requestPath(req),
    host: firstHeaderValue(req.headers.host),
    ip: req.socket?.remoteAddress || "",
    forwardedIp: forwardedIp(req),
    userAgent: firstHeaderValue(req.headers["user-agent"]),
    status: res.statusCode,
    durationMs,
  };

  for (const header of SENSITIVE_HEADERS) {
    if (entry[header]) delete entry[header];
  }

  console.log(JSON.stringify(entry));
}

await app.prepare();

createServer((req, res) => {
  const startedAt = Date.now();
  res.on("finish", () => accessLog(req, res, startedAt));
  handle(req, res);
}).listen(port, hostname, () => {
  console.log(`[mcphosting/web] listening on http://${hostname}:${port}`);
});
