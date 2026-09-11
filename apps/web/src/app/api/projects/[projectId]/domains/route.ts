import { DomainError } from "@mcphosting/core";
import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };
function validation(error: DomainError) {
  return NextResponse.json({ code: "VALIDATION_ERROR", message: "Проверьте заполнение полей", errors: [{ field: error.field, message: error.message, rule: error.code }] }, { status: 422 });
}
async function authorize(ctx: Ctx) {
  const { projectId } = await ctx.params;
  const user = await getOptionalUser();
  const service = getService();
  const project = user ? await service.getProject(user.id, projectId) : null;
  return { projectId, user, service, project };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { projectId, user, service, project } = await authorize(ctx);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" }, { status: 401 });
  if (!project) return NextResponse.json({ code: "NOT_FOUND", message: "Проект не найден" }, { status: 404 });
  return NextResponse.json({ domains: await service.listDomains(user.id, projectId), systemDomainEnabled: project.systemDomainEnabled, setup: await service.domainSetup("") });
}

export async function POST(req: Request, ctx: Ctx) {
  const { projectId, user, service, project } = await authorize(ctx);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" }, { status: 401 });
  if (!project) return NextResponse.json({ code: "NOT_FOUND", message: "Проект не найден" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.hostname !== "string") return validation(new DomainError("REQUIRED", "Введите домен."));
  try {
    const domain = await service.addDomain(user.id, projectId, body.hostname);
    return NextResponse.json({ domain, setup: await service.domainSetup(domain.hostname) }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return validation(error);
    throw error;
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { projectId, user, service, project } = await authorize(ctx);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" }, { status: 401 });
  if (!project) return NextResponse.json({ code: "NOT_FOUND", message: "Проект не найден" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.systemDomainEnabled !== "boolean") return validation(new DomainError("BOOLEAN", "Укажите, включён ли системный домен.", "systemDomainEnabled"));
  return NextResponse.json(await service.setSystemDomain(user.id, projectId, body.systemDomainEnabled));
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { projectId, user, service, project } = await authorize(ctx);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Войдите в аккаунт" }, { status: 401 });
  if (!project) return NextResponse.json({ code: "NOT_FOUND", message: "Проект не найден" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (typeof body?.hostname !== "string") return validation(new DomainError("REQUIRED", "Введите домен."));
  try {
    await service.removeDomain(user.id, projectId, body.hostname);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ code: "NOT_FOUND", message: "Домен не найден" }, { status: 404 }); }
}
