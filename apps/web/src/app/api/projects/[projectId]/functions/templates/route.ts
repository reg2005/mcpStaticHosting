import { NextResponse } from "next/server";
import { leadTemplateFiles } from "@mcphosting/core";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { includeForm = true, overwrite = false } = (await req.json().catch(() => ({}))) as {
    includeForm?: boolean;
    overwrite?: boolean;
  };
  const wanted = leadTemplateFiles(includeForm);
  const existing = new Set(await service.git.listFiles(projectId));
  const files = wanted.filter((file) => overwrite || !existing.has(file.path));

  if (files.length === 0) {
    return NextResponse.json({ ok: true, files: await service.git.listFiles(projectId), added: [] });
  }

  await service.git.writeFiles(projectId, files, "Add local backend lead template");
  return NextResponse.json({
    ok: true,
    added: files.map((file) => file.path),
    files: await service.git.listFiles(projectId),
  });
}
