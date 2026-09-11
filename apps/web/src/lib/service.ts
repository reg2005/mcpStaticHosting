import "server-only";
import { ProjectService } from "@mcphosting/core";
import { getDb } from "@mcphosting/db";

declare global {
  // eslint-disable-next-line no-var
  var __mcphostingService: ProjectService | undefined;
}

export function getService(): ProjectService {
  if (!globalThis.__mcphostingService || !("data" in globalThis.__mcphostingService)) {
    globalThis.__mcphostingService = new ProjectService(getDb(), {
      baseDomain: process.env.PUBLIC_BASE_DOMAIN ?? process.env.BASE_DOMAIN ?? "lvh.me",
      repoRoot: process.env.REPO_ROOT ?? "./data/repos",
      snapshotRoot: process.env.SNAPSHOT_ROOT ?? "./data/snapshots",
      dataRoot: process.env.JSON_DATA_ROOT ?? "./data/json-db",
      siteScheme: process.env.PUBLIC_SITE_SCHEME,
      sitePort: process.env.PUBLIC_SITE_PORT,
    });
  }
  return globalThis.__mcphostingService;
}
