import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { simpleGit, type SimpleGit } from "simple-git";

const execFileAsync = promisify(execFile);

const AUTHOR = { name: "mcphosting", email: "bot@example.com" } as const;
const DRAFT_BRANCH = "draft";
const PROD_BRANCH = "production";

export interface GitStoreConfig {
  /** Directory holding one working-tree git repo per project. */
  repoRoot: string;
  /** Directory holding materialized per-release snapshots served in production. */
  snapshotRoot: string;
}

export interface FileWrite {
  path: string;
  /** UTF-8 text, or base64 when `encoding` is "base64" (for binary assets). */
  content: string;
  encoding?: "utf8" | "base64";
}

export interface PublishResult {
  commit: string;
  snapshotDir: string;
}

const PLACEHOLDER_INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New mcphosting site</title>
  </head>
  <body>
    <h1>Hello from mcphosting 👋</h1>
    <p>Edit me via MCP or the dashboard, then publish.</p>
  </body>
</html>
`;

/**
 * File-backed project storage. Each project is a git working-tree repo:
 *   - the `draft` branch / working tree is what the editor and preview see;
 *   - `publish` commits the draft, tags it `rel-N`, fast-forwards `production`,
 *     and exports a flat snapshot directory that the router serves directly
 *     (so binary assets and hot-path reads never touch git).
 */
export class GitStore {
  constructor(private readonly config: GitStoreConfig) {}

  repoDir(projectId: string): string {
    return path.join(this.config.repoRoot, projectId);
  }

  /** Directory the preview subdomain serves (the live draft). */
  previewDir(projectId: string): string {
    return this.repoDir(projectId);
  }

  /** Directory the production subdomain serves for a given release version. */
  snapshotDir(projectId: string, version: number): string {
    return path.join(this.config.snapshotRoot, projectId, `v${version}`);
  }

  private git(projectId: string): SimpleGit {
    return simpleGit(this.repoDir(projectId));
  }

  /** Resolve a user-supplied path safely inside the repo (blocks `..` escapes). */
  private resolveInRepo(projectId: string, rel: string): string {
    const repo = this.repoDir(projectId);
    const abs = path.resolve(repo, rel);
    if (abs !== repo && !abs.startsWith(repo + path.sep)) {
      throw new Error(`Path escapes project root: ${rel}`);
    }
    if (rel.split("/").includes(".git")) {
      throw new Error(`The .git directory is reserved: ${rel}`);
    }
    return abs;
  }

  async ensureProject(projectId: string): Promise<string> {
    const dir = this.repoDir(projectId);
    try {
      await fs.access(path.join(dir, ".git"));
      return dir;
    } catch {
      // not initialized yet
    }
    await fs.mkdir(dir, { recursive: true });
    const git = simpleGit(dir);
    await git.init();
    await git.addConfig("user.name", AUTHOR.name);
    await git.addConfig("user.email", AUTHOR.email);
    await fs.writeFile(path.join(dir, "index.html"), PLACEHOLDER_INDEX, "utf8");
    await git.add(".");
    await git.commit("Initial commit");
    await git.raw(["branch", "-M", DRAFT_BRANCH]);
    await git.raw(["branch", PROD_BRANCH, DRAFT_BRANCH]);
    return dir;
  }

  async listFiles(projectId: string): Promise<string[]> {
    const git = this.git(projectId);
    const out = await git.raw(["ls-files"]);
    return out.split("\n").map((l) => l.trim()).filter(Boolean).sort();
  }

  async readFile(projectId: string, rel: string): Promise<string> {
    const abs = this.resolveInRepo(projectId, rel);
    return fs.readFile(abs, "utf8");
  }

  /** Raw bytes of a draft file (for binary asset previews/downloads). */
  async readFileBuffer(projectId: string, rel: string): Promise<Buffer> {
    const abs = this.resolveInRepo(projectId, rel);
    return fs.readFile(abs);
  }

  async writeFiles(
    projectId: string,
    files: FileWrite[],
    message = "Update files",
  ): Promise<string> {
    await this.ensureProject(projectId);
    for (const file of files) {
      const abs = this.resolveInRepo(projectId, file.path);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const buf =
        file.encoding === "base64"
          ? Buffer.from(file.content, "base64")
          : Buffer.from(file.content, "utf8");
      await fs.writeFile(abs, buf);
    }
    return this.commitDraft(projectId, message);
  }

  async deleteFile(projectId: string, rel: string): Promise<string> {
    const abs = this.resolveInRepo(projectId, rel);
    await fs.rm(abs, { force: true });
    return this.commitDraft(projectId, `Delete ${rel}`);
  }

  /** Move/rename a file within the draft (binary-safe). */
  async renameFile(projectId: string, from: string, to: string): Promise<string> {
    const absFrom = this.resolveInRepo(projectId, from);
    const absTo = this.resolveInRepo(projectId, to);
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
    return this.commitDraft(projectId, `Rename ${from} → ${to}`);
  }

  /** Stage everything and commit to draft if there are changes. Returns HEAD sha. */
  async commitDraft(projectId: string, message: string): Promise<string> {
    const git = this.git(projectId);
    await git.add("-A");
    const status = await git.status();
    if (!status.isClean()) {
      await git.commit(message);
    }
    return (await git.revparse(["HEAD"])).trim();
  }

  /**
   * Publish the current draft as release `version`: commit pending edits, tag,
   * fast-forward production, and export a flat snapshot for the router.
   */
  async publish(projectId: string, version: number, message: string): Promise<PublishResult> {
    const git = this.git(projectId);
    const commit = await this.commitDraft(projectId, message || `Release v${version}`);
    await git.raw(["tag", "-f", `rel-${version}`, commit]);
    await git.raw(["branch", "-f", PROD_BRANCH, commit]);

    const dest = this.snapshotDir(projectId, version);
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(dest, { recursive: true });
    // `git archive | tar -x` gives us a clean tree without the .git dir.
    await execFileAsync("sh", [
      "-c",
      `git -C "${this.repoDir(projectId)}" archive --format=tar ${commit} | tar -x -C "${dest}"`,
    ]);
    return { commit, snapshotDir: dest };
  }

  /** Remove a project's repo and all its published snapshots from disk. */
  async remove(projectId: string): Promise<void> {
    await fs.rm(this.repoDir(projectId), { recursive: true, force: true });
    await fs.rm(path.join(this.config.snapshotRoot, projectId), { recursive: true, force: true });
  }

  async history(projectId: string): Promise<{ hash: string; date: string; message: string }[]> {
    const git = this.git(projectId);
    const log = await git.log({ maxCount: 50 });
    return log.all.map((c) => ({ hash: c.hash, date: c.date, message: c.message }));
  }
}
