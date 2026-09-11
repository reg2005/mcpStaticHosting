import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

/** List a project's published releases (newest first). */
export async function GET(_req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ releases: await service.listReleases(user.id, projectId) });
}

/** Roll production back to an earlier release version. */
export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { version } = (await req.json()) as { version?: number };
  if (!version) return NextResponse.json({ error: "version required" }, { status: 400 });

  try {
    const release = await service.rollback(user.id, projectId, version);
    return NextResponse.json({ ok: true, version: release.version });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
