import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string; collection: string }> };

async function authorize(projectId: string) {
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  return project ? service : null;
}

export async function GET(req: Request, { params }: Ctx) {
  const { projectId, collection } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  try {
    return NextResponse.json({
      collection,
      records: await service.data.listRecords(projectId, collection, { limit, offset }),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { projectId, collection } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id, status, note } = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: "new" | "processing" | "done" | "rejected";
    note?: string;
  };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (status && !["new", "processing", "done", "rejected"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const patch: { status?: NonNullable<typeof status>; note?: string } = {};
    if (status) patch.status = status;
    if (note !== undefined) patch.note = note;
    return NextResponse.json({
      record: await service.data.updateRecord(projectId, collection, id, patch),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId, collection } = await params;
  const service = await authorize(projectId);
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const remaining = await service.data.deleteRecord(projectId, collection, id);
      return NextResponse.json({ ok: true, remaining });
    }
    await service.data.clearCollection(projectId, collection);
    return NextResponse.json({ ok: true, remaining: 0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
