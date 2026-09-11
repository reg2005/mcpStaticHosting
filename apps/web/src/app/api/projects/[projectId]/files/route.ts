import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

async function authorize(projectId: string) {
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  return project ? service : null;
}

export async function GET(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ files: await service.git.listFiles(projectId) });

  const content = await service.git.readFile(projectId, path);
  return NextResponse.json({ path, content });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { path, content } = (await req.json()) as { path: string; content: string };
  const commit = await service.git.writeFiles(projectId, [{ path, content }], `Edit ${path}`);
  return NextResponse.json({ ok: true, commit });
}

/** Create a new file or upload a (possibly binary, base64) asset. */
export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { path, content, encoding } = (await req.json()) as {
    path?: string;
    content?: string;
    encoding?: "utf8" | "base64";
  };
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  try {
    const commit = await service.git.writeFiles(
      projectId,
      [{ path, content: content ?? "", encoding }],
      `Add ${path}`,
    );
    return NextResponse.json({ ok: true, commit, files: await service.git.listFiles(projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Rename/move a file in the draft. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { from, to } = (await req.json()) as { from?: string; to?: string };
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  try {
    const commit = await service.git.renameFile(projectId, from, to);
    return NextResponse.json({ ok: true, commit, files: await service.git.listFiles(projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Delete a file from the draft. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  try {
    const commit = await service.git.deleteFile(projectId, path);
    return NextResponse.json({ ok: true, commit, files: await service.git.listFiles(projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
