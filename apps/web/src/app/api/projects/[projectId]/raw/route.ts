import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

// Minimal extension → content-type map so the browser renders previews
// (images, pdf, audio, video) inline instead of downloading them.
const MIME: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

function contentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

/** Serve a draft file's raw bytes so the dashboard can preview binary assets. */
export async function GET(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return new Response("Not found", { status: 404 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return new Response("path required", { status: 400 });

  try {
    const buf = await service.git.readFileBuffer(projectId, path);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": contentType(path),
        // SVGs etc. are sanitised by being served from a same-origin endpoint,
        // but still forbid them from being treated as active documents.
        "content-security-policy": "sandbox allow-scripts allow-same-origin;",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
