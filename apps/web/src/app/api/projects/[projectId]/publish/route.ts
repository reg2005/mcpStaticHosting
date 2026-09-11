import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const release = await getService().publish(user.id, projectId, "Publish from dashboard");
  return NextResponse.json({ ok: true, version: release.version, commit: release.gitCommit });
}
