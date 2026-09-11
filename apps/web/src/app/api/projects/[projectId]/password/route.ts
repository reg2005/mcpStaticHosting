import { previewBypassToken } from "@mcphosting/core";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

/** Fresh iframe src for the preview pane after the lock state changes. */
function previewSrc(previewUrl: string, projectId: string, locked: boolean): string {
  if (!locked) return previewUrl;
  const token = previewBypassToken(projectId);
  return `${previewUrl.replace(/\/$/, "")}/__mcphosting/preview-access?token=${encodeURIComponent(token)}&next=/`;
}

/** Set or change the site password. */
export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { password } = (await req.json()) as { password?: string };
  if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 });

  await service.setPassword(user.id, projectId, password);
  const { previewUrl } = service.hostsFor(project.slug, user.shortId);
  return NextResponse.json({
    ok: true,
    protected: true,
    previewSrc: previewSrc(previewUrl, projectId, true),
  });
}

/** Remove the site password (make it public again). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await service.removePassword(user.id, projectId);
  const { previewUrl } = service.hostsFor(project.slug, user.shortId);
  return NextResponse.json({
    ok: true,
    protected: false,
    previewSrc: previewSrc(previewUrl, projectId, false),
  });
}
