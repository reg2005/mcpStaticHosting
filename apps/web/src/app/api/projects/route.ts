import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const result = await getService().createProject(user.id, name);
  return NextResponse.json({
    id: result.project.id,
    slug: result.project.slug,
    productionUrl: result.productionUrl,
    previewUrl: result.previewUrl,
  });
}
