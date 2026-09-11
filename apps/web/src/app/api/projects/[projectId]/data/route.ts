import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

async function authorize(projectId: string) {
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  return project ? { service, project } : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    collections: await auth.service.data.listCollections(projectId),
  });
}
