import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * File-based routing for backend functions. Files under `functions/` map to
 * routes: functions/api/hello.ts -> /api/hello, functions/api/index.ts -> /api,
 * functions/api/[id].ts -> /api/:id (dynamic segment).
 */
export interface FunctionRoute {
  /** Path of the handler file relative to the project root, e.g. "functions/api/hello.ts". */
  file: string;
  /** Route segments; dynamic ones carry a param name. */
  segments: { value: string; param: string | null }[];
}

export interface RouteMatch {
  file: string;
  params: Record<string, string>;
}

const HANDLER_EXT = /\.(ts|tsx|js|mjs)$/;

export async function scanFunctionRoutes(dir: string): Promise<FunctionRoute[]> {
  const root = path.join(dir, "functions");
  const routes: FunctionRoute[] = [];

  async function walk(current: string, parts: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), [...parts, entry.name]);
        continue;
      }
      if (!HANDLER_EXT.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
      const base = entry.name.replace(HANDLER_EXT, "");
      const routeParts = base === "index" ? parts : [...parts, base];
      routes.push({
        file: path.posix.join("functions", ...parts, entry.name),
        segments: routeParts.map((p) =>
          p.startsWith("[") && p.endsWith("]")
            ? { value: p, param: p.slice(1, -1) }
            : { value: p, param: null },
        ),
      });
    }
  }

  await walk(root, []);
  // Static routes win over dynamic ones: try the fewest-param routes first.
  routes.sort(
    (a, b) =>
      a.segments.filter((s) => s.param).length - b.segments.filter((s) => s.param).length,
  );
  return routes;
}

export function matchRoute(routes: FunctionRoute[], pathname: string): RouteMatch | null {
  const reqParts = pathname.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.segments.length !== reqParts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i]!;
      const part = reqParts[i]!;
      if (seg.param) params[seg.param] = decodeURIComponent(part);
      else if (seg.value !== part) {
        ok = false;
        break;
      }
    }
    if (ok) return { file: route.file, params };
  }
  return null;
}
