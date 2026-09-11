import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

/** Update project metadata (currently just the display name). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const updated = await service.renameProject(user.id, projectId, name);
  return NextResponse.json({ id: updated.id, name: updated.name });
}
