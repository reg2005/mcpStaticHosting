import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

/** List a project's secret keys (values are never returned). */
export async function GET(_req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ env: await service.listEnv(user.id, projectId) });
}

/** Set (create or update) a secret. */
export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { key, value } = (await req.json()) as { key?: string; value?: string };
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  try {
    await service.setEnv(user.id, projectId, key, value);
    return NextResponse.json({ ok: true, env: await service.listEnv(user.id, projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Delete a secret. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  try {
    await service.deleteEnv(user.id, projectId, key);
    return NextResponse.json({ ok: true, env: await service.listEnv(user.id, projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
