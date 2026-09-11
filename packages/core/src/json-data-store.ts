import { promises as fs } from "node:fs";
import path from "node:path";

export interface JsonDataRecord<T = unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: T;
  meta?: Record<string, unknown>;
  note?: string;
}

export interface JsonCollectionSummary {
  name: string;
  count: number;
  updatedAt: string | null;
  latest: JsonDataRecord | null;
}

const COLLECTION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function assertCollection(name: string): string {
  if (!COLLECTION_RE.test(name)) {
    throw new Error("Collection must be 1-64 letters, numbers, dashes or underscores");
  }
  return name;
}

export class JsonDataStore {
  constructor(private readonly root: string) {}

  private projectDir(projectId: string): string {
    return path.join(this.root, projectId);
  }

  private collectionFile(projectId: string, collection: string): string {
    return path.join(this.projectDir(projectId), `${assertCollection(collection)}.json`);
  }

  async listCollections(projectId: string): Promise<JsonCollectionSummary[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.projectDir(projectId));
    } catch {
      return [];
    }

    const summaries = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const name = entry.slice(0, -".json".length);
          const records = await this.listRecords(projectId, name, { limit: 1 });
          const all = await this.readCollection(projectId, name);
          return {
            name,
            count: all.length,
            updatedAt: records[0]?.updatedAt ?? null,
            latest: records[0] ?? null,
          };
        }),
    );

    return summaries.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  async listRecords(
    projectId: string,
    collection: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<JsonDataRecord[]> {
    const records = await this.readCollection(projectId, collection);
    const offset = Math.max(0, opts.offset ?? 0);
    const limit = Math.min(Math.max(1, opts.limit ?? 100), 500);
    return records
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit);
  }

  async updateRecord(
    projectId: string,
    collection: string,
    id: string,
    patch: Pick<Partial<JsonDataRecord>, "status" | "note">,
  ): Promise<JsonDataRecord> {
    const records = await this.readCollection(projectId, collection);
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Record not found");

    const next: JsonDataRecord = {
      ...records[index]!,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    records[index] = next;
    await this.writeCollection(projectId, collection, records);
    return next;
  }

  async deleteRecord(projectId: string, collection: string, id: string): Promise<number> {
    const records = await this.readCollection(projectId, collection);
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) throw new Error("Record not found");
    await this.writeCollection(projectId, collection, next);
    return next.length;
  }

  async clearCollection(projectId: string, collection: string): Promise<void> {
    await this.writeCollection(projectId, collection, []);
  }

  private async readCollection(projectId: string, collection: string): Promise<JsonDataRecord[]> {
    const file = this.collectionFile(projectId, collection);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as JsonDataRecord[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeCollection(
    projectId: string,
    collection: string,
    records: JsonDataRecord[],
  ): Promise<void> {
    const file = this.collectionFile(projectId, collection);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}
