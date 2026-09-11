import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";

type Ctx = { params: Promise<{ projectId: string }> };

function customDomainSetup(hostname: string, targetHost: string) {
  return {
    hostname,
    targetHost,
    dns: {
      subdomain: { type: "CNAME", name: hostname, value: targetHost },
      apex: {
        type: "ALIAS/ANAME or A",
        name: hostname,
        value:
          "Use ALIAS/ANAME to the target host if your DNS provider supports it; otherwise point A/AAAA to the platform ingress IP configured for this deployment.",
      },
    },
    instructions: [
      `Open the DNS settings for ${hostname}.`,
      `For a subdomain, create a CNAME record pointing to ${targetHost}.`,
      "For an apex/root domain, use ALIAS/ANAME to the target host if available, or use the platform ingress A/AAAA records configured for this deployment.",
      "Remove conflicting A, AAAA or CNAME records for the same hostname.",
      "Wait for DNS propagation, then open the hostname. Ask the server operator to configure this domain and its TLS certificate in the reverse proxy.",
    ],
  };
}

/** List a project's custom domains. */
export async function GET(_req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ domains: await service.listDomains(user.id, projectId) });
}

/** Attach a custom domain (claim-based ownership). */
export async function POST(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { hostname } = (await req.json()) as { hostname?: string };
  if (!hostname) return NextResponse.json({ error: "hostname required" }, { status: 400 });

  try {
    const domain = await service.addDomain(user.id, projectId, hostname);
    const targetHost = new URL(service.hostsFor(project.slug, user.shortId).productionUrl).host;
    return NextResponse.json({ ok: true, domain, setup: customDomainSetup(domain.hostname, targetHost) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Detach a custom domain. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();
  const project = await service.getProject(user.id, projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { hostname } = (await req.json()) as { hostname?: string };
  if (!hostname) return NextResponse.json({ error: "hostname required" }, { status: 400 });

  try {
    await service.removeDomain(user.id, projectId, hostname);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
