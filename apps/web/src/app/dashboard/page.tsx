import { getCurrentUser } from "@/lib/session";
import { getService } from "@/lib/service";
import { DashboardNav } from "./nav";
import { SitesPanel, type SiteItem } from "./sites-panel";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentUser();
  const service = getService();
  const projects = await service.listProjects(user.id);

  const sites: SiteItem[] = projects.map((p) => {
    const urls = service.hostsFor(p.slug, user.shortId);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      passwordProtected: p.passwordHash !== null,
      productionUrl: urls.productionUrl,
      previewUrl: urls.previewUrl,
    };
  });

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(24px, 6vw, 48px) 20px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <DashboardNav />
      </div>
      <SitesPanel projects={sites} />
    </main>
  );
}
