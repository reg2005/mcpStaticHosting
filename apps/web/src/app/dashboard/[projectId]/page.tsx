import { previewBypassToken } from "@mcphosting/core";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

/**
 * The iframe loads the preview host directly (browser → router), so for a
 * password-protected site we hand it a signed bypass URL: the router validates
 * the token and grants gate access on the preview host without the owner
 * re-typing the password. Public sites just load the plain preview URL.
 */
function previewSrcFor(previewUrl: string, projectId: string, locked: boolean): string {
  if (!locked) return previewUrl;
  const token = previewBypassToken(projectId);
  return `${previewUrl.replace(/\/$/, "")}/__mcphosting/preview-access?token=${encodeURIComponent(token)}&next=/`;
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  const service = getService();

  const project = await service.getProject(user.id, projectId);
  if (!project) notFound();

  const files = await service.git.listFiles(projectId);
  const urls = service.hostsFor(project.slug, user.shortId);
  const locked = project.passwordHash !== null;
  const [env, releases, dataCollections] = await Promise.all([
    service.listEnv(user.id, projectId),
    service.listReleases(user.id, projectId),
    service.data.listCollections(projectId),
  ]);

  return (
    <Editor
      projectId={projectId}
      projectName={project.name}
      files={files}
      previewUrl={urls.previewUrl}
      previewSrc={previewSrcFor(urls.previewUrl, projectId, locked)}
      productionUrl={urls.productionUrl}
      passwordProtected={locked}
      systemDomainEnabled={project.systemDomainEnabled}
      secrets={env.map((e) => e.key)}
      releases={releases.map((r) => ({
        version: r.version,
        message: r.message,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))}
      dataCollections={dataCollections}
    />
  );
}
