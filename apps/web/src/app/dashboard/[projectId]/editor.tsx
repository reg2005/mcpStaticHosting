"use client";

import { DomainPanel } from "./domain-panel";
import MonacoEditor, { loader } from "@monaco-editor/react";
loader.config({ paths: { vs: "/monaco/vs" } });
import type { Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FUNCTION_TYPES_DTS = `
interface McpHostingKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

interface McpHostingDataRecord<T = unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: T;
  meta?: Record<string, unknown>;
}

interface McpHostingDataStore {
  insert<T>(collection: string, data: T, meta?: Record<string, unknown>): Promise<McpHostingDataRecord<T>>;
  list<T = unknown>(collection: string, opts?: { limit?: number; offset?: number }): Promise<McpHostingDataRecord<T>[]>;
  get<T = unknown>(collection: string, id: string): Promise<McpHostingDataRecord<T> | null>;
}

interface McpHostingFunctionCtx {
  env: Record<string, string>;
  params: Record<string, string>;
  kv: McpHostingKV;
  data: McpHostingDataStore;
}

type McpHostingHandler = (req: Request, ctx: McpHostingFunctionCtx) => Response | Promise<Response>;
`;

const VALIDATION_LIB_DTS = `
export interface McpHostingKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

export interface McpHostingDataRecord<T = unknown> {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: T;
  meta?: Record<string, unknown>;
}

export interface McpHostingDataStore {
  insert<T>(collection: string, data: T, meta?: Record<string, unknown>): Promise<McpHostingDataRecord<T>>;
  list<T = unknown>(collection: string, opts?: { limit?: number; offset?: number }): Promise<McpHostingDataRecord<T>[]>;
  get<T = unknown>(collection: string, id: string): Promise<McpHostingDataRecord<T> | null>;
}

export interface McpHostingFunctionCtx {
  env: Record<string, string>;
  params: Record<string, string>;
  kv: McpHostingKV;
  data: McpHostingDataStore;
}

export type ValidationErrors = Record<string, string>;
export function json(body: unknown, status?: number): Response;
export function cleanString(value: unknown): string;
export function minLength(value: string, min: number): boolean;
export function validEmail(value: string): boolean;
export function parseJsonBody<T>(req: Request): Promise<{ ok: true; data: T } | { ok: false; error: string }>;
`;

let monacoConfigured = false;
function configureMonaco(monaco: Monaco) {
  if (monacoConfigured) return;
  monacoConfigured = true;

  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
  };
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    ...compilerOptions,
    allowJs: true,
    checkJs: false,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    FUNCTION_TYPES_DTS,
    "file:///mcphosting-functions.d.ts",
  );
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    FUNCTION_TYPES_DTS,
    "file:///mcphosting-functions.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    VALIDATION_LIB_DTS,
    "file:///functions/lib/validation.ts",
  );
}

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
      return "html";
    case "css":
      return "css";
    case "js":
    case "mjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

/** Files we render in Monaco; anything else (images, fonts…) is a binary asset. */
const TEXT_EXT = new Set(["html", "css", "js", "mjs", "ts", "json", "md", "txt", "xml", "svg", "csv"]);
function isTextFile(path: string): boolean {
  return TEXT_EXT.has(path.split(".").pop()?.toLowerCase() ?? "");
}

type MediaKind = "image" | "audio" | "video" | "pdf" | "other";
function mediaKind(path: string): MediaKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp"].includes(ext)) return "image";
  if (["mp3", "wav", "ogg", "oga", "m4a", "flac"].includes(ext)) return "audio";
  if (["mp4", "webm", "mov", "ogv"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}
function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  for (const f of files) {
    const parts = f.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let child = cur.children!.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, isDir: !isLast, children: isLast ? undefined : [] };
        cur.children!.push(child);
      }
      cur = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root.children!);
  return root.children!;
}

/** Folder paths that are ancestors of a file (so we can auto-expand to it). */
function ancestorDirs(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

interface Release {
  version: number;
  message: string | null;
  createdAt: string;
}

interface DataRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "new" | "processing" | "done" | "rejected";
  data: unknown;
  meta?: Record<string, unknown>;
  note?: string;
}

interface DataCollection {
  name: string;
  count: number;
  updatedAt: string | null;
  latest: DataRecord | null;
}

interface Props {
  projectId: string;
  projectName: string;
  files: string[];
  previewUrl: string;
  previewSrc: string;
  productionUrl: string;
  passwordProtected: boolean;
  systemDomainEnabled: boolean;
  secrets: string[];
  releases: Release[];
  dataCollections: DataCollection[];
}

export function Editor({
  projectId,
  projectName,
  files: initialFiles,
  previewSrc: initialPreviewSrc,
  productionUrl,
  passwordProtected: initialProtected,
  systemDomainEnabled: initialSystemDomainEnabled,
  secrets: initialSecrets,
  releases: initialReleases,
  dataCollections: initialDataCollections,
}: Props) {
  const [name, setName] = useState(projectName);
  const [files, setFiles] = useState(initialFiles);
  const [active, setActive] = useState(initialFiles[0] ?? "index.html");
  const [content, setContent] = useState("");
  const [binary, setBinary] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [locked, setLocked] = useState(initialProtected);
  const [previewSrc, setPreviewSrc] = useState(initialPreviewSrc);
  const [systemDomainEnabled, setSystemDomainEnabled] = useState(initialSystemDomainEnabled);
  const [secrets, setSecrets] = useState(initialSecrets);
  const [releases, setReleases] = useState(initialReleases);
  const [dataCollections, setDataCollections] = useState(initialDataCollections);
  const [activeCollection, setActiveCollection] = useState(initialDataCollections[0]?.name ?? "leads");
  const [dataRecords, setDataRecords] = useState<DataRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ancestorDirs(initialFiles[0] ?? "")),
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const narrow = useIsNarrow();
  const [mobileView, setMobileView] = useState<"files" | "code" | "site" | "data">("code");

  const tree = useMemo(() => buildTree(files), [files]);

  const loadFile = useCallback(
    async (path: string) => {
      setActive(path);
      if (!isTextFile(path)) {
        setBinary(true);
        setContent("");
        setDirty(false);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setBinary(false);
      setContent(data.content ?? "");
      setDirty(false);
    },
    [projectId],
  );

  useEffect(() => {
    if (active) void loadFile(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Open a file and, on mobile, jump to the Code tab. */
  function openFile(path: string) {
    void loadFile(path);
    if (narrow) setMobileView("code");
  }

  async function renameProject(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === name) return;
    setStatus("Renaming…");
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Rename failed"}`);
    setName(data.name);
    setStatus(`Renamed to ${data.name}`);
  }

  async function save() {
    setStatus("Saving…");
    await fetch(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: active, content }),
    });
    setDirty(false);
    setStatus("Saved to draft");
  }

  async function publish() {
    if (dirty) await save();
    setStatus("Publishing…");
    const res = await fetch(`/api/projects/${projectId}/publish`, { method: "POST" });
    const data = await res.json();
    setStatus(`Published v${data.version}`);
    void refreshReleases();
  }

  function copyPath() {
    if (!active) return;
    void navigator.clipboard?.writeText(active);
    setStatus(`Copied path: ${active}`);
  }

  // --- Tree interactions ---

  function toggle(path: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function remapAfterMove(from: string, to: string) {
    setActive((a) =>
      a === from ? to : a.startsWith(from + "/") ? to + a.slice(from.length) : a,
    );
    setExpanded((s) => {
      const next = new Set<string>();
      for (const p of s) {
        if (p === from) next.add(to);
        else if (p.startsWith(from + "/")) next.add(to + p.slice(from.length));
        else next.add(p);
      }
      for (const d of ancestorDirs(to)) next.add(d);
      return next;
    });
  }

  async function move(from: string, to: string) {
    if (!to || to === from) return;
    setStatus("Moving…");
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Move failed"}`);
    setFiles(data.files);
    remapAfterMove(from, to);
    setStatus(`Moved to ${to}`);
  }

  function startRename(node: TreeNode) {
    setRenaming(node.path);
    setRenameValue(node.name);
  }

  function commitRename() {
    const path = renaming;
    setRenaming(null);
    if (!path) return;
    const name = renameValue.trim();
    if (!name || name === basename(path) || name.includes("/")) return;
    const dir = dirname(path);
    void move(path, dir ? `${dir}/${name}` : name);
  }

  /** Drop `dragPath` into folder `targetDir` ("" = repo root). */
  function dropInto(targetDir: string) {
    const from = dragPath;
    setDragPath(null);
    setDropTarget(null);
    if (!from) return;
    if (targetDir === from || targetDir.startsWith(from + "/")) return; // into itself
    if (targetDir === dirname(from)) return; // already there
    const to = targetDir ? `${targetDir}/${basename(from)}` : basename(from);
    void move(from, to);
  }

  // --- Files ---

  async function newFile() {
    const seed = active && dirname(active) ? `${dirname(active)}/` : "";
    const path = window.prompt("New file path (e.g. about.html or assets/app.css):", seed);
    if (!path) return;
    setStatus("Creating…");
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content: "" }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Failed"}`);
    setFiles(data.files);
    setExpanded((s) => new Set([...s, ...ancestorDirs(path)]));
    setStatus(`Created ${path}`);
    openFile(path);
  }

  function pickUpload() {
    uploadRef.current?.click();
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dir = active && dirname(active) ? `${dirname(active)}/` : "";
    const path = window.prompt("Save uploaded asset as:", dir + file.name);
    if (!path) return;
    setStatus(`Uploading ${file.name}…`);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    const base64 = btoa(bin);
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content: base64, encoding: "base64" }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Upload failed"}`);
    setFiles(data.files);
    setExpanded((s) => new Set([...s, ...ancestorDirs(path)]));
    setStatus(`Uploaded ${path}`);
    openFile(path);
  }

  async function deleteNode(node: TreeNode) {
    const what = node.isDir ? `folder ${node.path} and everything in it` : node.path;
    if (!window.confirm(`Delete ${what}?`)) return;
    setStatus("Deleting…");
    // Deleting a folder = delete each file under it.
    const targets = node.isDir
      ? files.filter((f) => f === node.path || f.startsWith(node.path + "/"))
      : [node.path];
    let data: { files?: string[]; error?: string } = {};
    for (const path of targets) {
      const res = await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      data = await res.json();
      if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Delete failed"}`);
    }
    if (data.files) setFiles(data.files);
    if (active === node.path || active.startsWith(node.path + "/")) {
      const next = data.files?.[0] ?? "";
      if (next) void loadFile(next);
      else {
        setActive("");
        setContent("");
      }
    }
    setStatus(`Deleted ${node.path}`);
  }

  // --- Password ---

  async function setPassword() {
    const password = window.prompt(
      locked ? "Enter a new password (replaces the current one):" : "Set a password for this site:",
    );
    if (!password) return;
    setStatus("Setting password…");
    const res = await fetch(`/api/projects/${projectId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setLocked(true);
    if (data.previewSrc) setPreviewSrc(data.previewSrc);
    setStatus("🔒 Site password set");
  }

  async function removePassword() {
    if (!window.confirm("Remove the password? Anyone will be able to view the site.")) return;
    setStatus("Removing password…");
    const res = await fetch(`/api/projects/${projectId}/password`, { method: "DELETE" });
    const data = await res.json();
    setLocked(false);
    if (data.previewSrc) setPreviewSrc(data.previewSrc);
    setStatus("🔓 Password removed — site is public");
  }

  // --- Secrets (ctx.env) ---

  async function addSecret() {
    const key = window.prompt("Secret key (e.g. API_KEY):");
    if (!key) return;
    const value = window.prompt(`Value for ${key}:`);
    if (value === null) return;
    setStatus("Saving secret…");
    const res = await fetch(`/api/projects/${projectId}/env`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Failed"}`);
    setSecrets(data.env.map((e: { key: string }) => e.key));
    setStatus(`Secret ${key} saved`);
  }

  async function deleteSecret(key: string) {
    if (!window.confirm(`Delete secret ${key}?`)) return;
    setStatus("Deleting secret…");
    const res = await fetch(`/api/projects/${projectId}/env?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Failed"}`);
    setSecrets(data.env.map((e: { key: string }) => e.key));
    setStatus(`Deleted secret ${key}`);
  }

  // --- Releases / rollback ---

  async function refreshReleases() {
    const res = await fetch(`/api/projects/${projectId}/releases`);
    if (res.ok) setReleases((await res.json()).releases);
  }

  async function rollback(version: number) {
    if (!window.confirm(`Roll production back to v${version}?`)) return;
    setStatus(`Rolling back to v${version}…`);
    const res = await fetch(`/api/projects/${projectId}/releases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Rollback failed"}`);
    setStatus(`Production now serving v${version}`);
  }

  // --- Local backend data ---

  async function refreshDataCollections() {
    const res = await fetch(`/api/projects/${projectId}/data`);
    const data = await res.json();
    if (res.ok) {
      setDataCollections(data.collections);
      const nextActive = activeCollection || data.collections[0]?.name || "leads";
      setActiveCollection(nextActive);
      if (data.collections.some((collection: DataCollection) => collection.name === nextActive)) {
        void loadDataRecords(nextActive);
      }
    }
  }

  async function loadDataRecords(collection = activeCollection) {
    if (!collection) return;
    setDataLoading(true);
    const res = await fetch(
      `/api/projects/${projectId}/data/${encodeURIComponent(collection)}?limit=100`,
    );
    const data = await res.json();
    setDataLoading(false);
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Failed to load data"}`);
    setActiveCollection(collection);
    setDataRecords(data.records);
  }

  useEffect(() => {
    if (!activeCollection && dataCollections[0]) {
      void loadDataRecords(dataCollections[0].name);
      return;
    }
    if (activeCollection) void loadDataRecords(activeCollection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function installLeadTemplate() {
    setStatus("Adding local backend template…");
    const res = await fetch(`/api/projects/${projectId}/functions/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeForm: true, overwrite: false }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Template failed"}`);
    setFiles(data.files);
    if (data.added?.length) {
      setExpanded((s) => new Set([...s, ...data.added.flatMap((path: string) => ancestorDirs(path))]));
      setStatus(`Added ${data.added.join(", ")}`);
      openFile(data.added[0]);
    } else {
      setStatus("Template already exists");
    }
  }

  useEffect(() => {
    function onPreviewMessage(event: MessageEvent) {
      if (event.data?.type !== "mcphosting:data-changed") return;
      const collection = String(event.data.collection || "leads");
      void refreshDataCollections();
      void loadDataRecords(collection);
    }

    window.addEventListener("message", onPreviewMessage);
    return () => window.removeEventListener("message", onPreviewMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCollection]);

  async function updateDataRecord(id: string, status: DataRecord["status"]) {
    const res = await fetch(`/api/projects/${projectId}/data/${encodeURIComponent(activeCollection)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Update failed"}`);
    setDataRecords((records) => records.map((record) => (record.id === id ? data.record : record)));
    void refreshDataCollections();
  }

  async function deleteDataRecord(id: string) {
    if (!window.confirm("Delete this record from the local JSON database?")) return;
    const res = await fetch(
      `/api/projects/${projectId}/data/${encodeURIComponent(activeCollection)}?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (!res.ok) return setStatus(`⚠️ ${data.error ?? "Delete failed"}`);
    setDataRecords((records) => records.filter((record) => record.id !== id));
    void refreshDataCollections();
  }

  const rawUrl = active
    ? `/api/projects/${projectId}/raw?path=${encodeURIComponent(active)}`
    : "";

  const filesPanel = (
    <>
      <SectionHeader label="Files">
        <IconButton onClick={newFile} title="New file">
          +
        </IconButton>
        <IconButton onClick={pickUpload} title="Upload asset">
          ⤒
        </IconButton>
      </SectionHeader>
      <input ref={uploadRef} type="file" hidden onChange={onUpload} />

      <div
        onDragOver={(e) => {
          if (dragPath) {
            e.preventDefault();
            setDropTarget("");
          }
        }}
        onDrop={() => dropInto("")}
        style={{
          marginTop: 6,
          minHeight: 40,
          borderRadius: 6,
          outline: dropTarget === "" && dragPath ? "1px dashed #3b82f6" : "none",
        }}
      >
        <Tree
          nodes={tree}
          depth={0}
          active={active}
          expanded={expanded}
          renaming={renaming}
          renameValue={renameValue}
          dropTarget={dropTarget}
          onToggle={toggle}
          onOpen={openFile}
          onStartRename={startRename}
          onRenameChange={setRenameValue}
          onCommitRename={commitRename}
          onCancelRename={() => setRenaming(null)}
          onDelete={deleteNode}
          onDragStart={setDragPath}
          onDropInto={dropInto}
          onDropTarget={setDropTarget}
          dragActive={!!dragPath}
        />
      </div>

      <DomainPanel projectId={projectId} productionUrl={productionUrl} onSystemChange={setSystemDomainEnabled} />

      <SectionHeader label="Secrets">
        <IconButton onClick={addSecret} title="Add a secret (ctx.env)">
          +
        </IconButton>
      </SectionHeader>
      <PanelList items={secrets} empty="No secrets yet." onRemove={deleteSecret} />
    </>
  );

  const dataPanel = (
    <DataPanel
      collections={dataCollections}
      active={activeCollection}
      records={dataRecords}
      loading={dataLoading}
      onInstallTemplate={installLeadTemplate}
      onRefreshCollections={refreshDataCollections}
      onLoadCollection={loadDataRecords}
      onUpdateRecord={updateDataRecord}
      onDeleteRecord={deleteDataRecord}
    />
  );

  const pathBar = (
    <>
      <code style={{ fontSize: 13, color: "#e6e8eb", whiteSpace: "nowrap" }}>{active || "—"}</code>
      <IconButton onClick={copyPath} title="Copy full path">
        ⧉
      </IconButton>
      <span style={badge(locked ? "#374151" : "#14321f", locked ? "#e6e8eb" : "#4ade80")}>
        {locked ? "🔒 Password-protected" : "🔓 Public — no password"}
      </span>
    </>
  );

  const actions = (
    <>
      <button onClick={() => setShowHistory((v) => !v)} style={btn("#374151")}>
        History
      </button>
      <button onClick={setPassword} style={btn("#374151")}>
        {locked ? "🔒 Change password" : "🔒 Set password"}
      </button>
      {locked && (
        <button onClick={removePassword} style={btn("#b91c1c")}>
          Remove password
        </button>
      )}
      <button onClick={save} disabled={!dirty || binary} style={btn("#374151")}>
        Save draft
      </button>
      <button onClick={publish} style={btn("#16a34a")}>
        Publish
      </button>
    </>
  );

  const codePanel = !active ? (
    <div style={{ padding: 24, color: "#9aa3ad", fontSize: 13 }}>No file selected.</div>
  ) : binary ? (
    <BinaryPreview path={active} url={rawUrl} />
  ) : (
    <MonacoEditor
      theme="vs-dark"
      language={languageFor(active)}
      path={`file:///${active}`}
      beforeMount={configureMonaco}
      value={content}
      onChange={(v) => {
        setContent(v ?? "");
        setDirty(true);
      }}
      options={{ minimap: { enabled: false }, fontSize: 13 }}
    />
  );

  const sitePane = (width: string) => systemDomainEnabled ? (
    <iframe
      title="preview"
      src={previewSrc}
      style={{ width, height: "100%", border: "none", borderLeft: "1px solid #1f242b", background: "white" }}
    />
  ) : (
    <div style={{ width, display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box", color: "#9aa3ad" }}>
      Системный адрес выключен. Включите его в разделе «Домены и HTTPS», чтобы открыть preview.
    </div>
  );

  // --- Mobile: single panel at a time, switched via Files | Code | Site tabs ---
  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        <header style={{ borderBottom: "1px solid #1f242b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
            <a href="/dashboard" style={{ color: "#60a5fa", fontSize: 13, whiteSpace: "nowrap" }}>
              ← sites
            </a>
            <EditableTitle
              value={name}
              onSave={renameProject}
              containerStyle={{ flex: 1, minWidth: 0 }}
              textStyle={{ fontSize: 14, fontWeight: 700 }}
            />
            <span
              style={{
                fontSize: 11,
                color: "#9aa3ad",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 130,
              }}
            >
              {status}
            </span>
          </div>
          <div style={{ display: "flex" }}>
            <SegTab active={mobileView === "files"} onClick={() => setMobileView("files")}>
              Files
            </SegTab>
            <SegTab active={mobileView === "code"} onClick={() => setMobileView("code")}>
              Code
            </SegTab>
            <SegTab active={mobileView === "site"} onClick={() => setMobileView("site")}>
              Site
            </SegTab>
            <SegTab active={mobileView === "data"} onClick={() => setMobileView("data")}>
              Data
            </SegTab>
          </div>
        </header>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid #1f242b",
            overflowX: "auto",
          }}
        >
          {pathBar}
          {actions}
        </div>

        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {/* Kept mounted (display toggled) so Monaco state & the iframe survive tab switches. */}
          <div
            style={{
              height: "100%",
              overflow: "auto",
              padding: 12,
              display: mobileView === "files" ? "block" : "none",
            }}
          >
            {filesPanel}
          </div>
          <div style={{ height: "100%", display: mobileView === "code" ? "block" : "none" }}>
            {codePanel}
          </div>
          <div style={{ height: "100%", display: mobileView === "site" ? "block" : "none" }}>
            {sitePane("100%")}
          </div>
          <div
            style={{
              height: "100%",
              overflow: "auto",
              padding: 12,
              display: mobileView === "data" ? "block" : "none",
            }}
          >
            {dataPanel}
          </div>
          {showHistory && (
            <HistoryPanel
              fullWidth
              releases={releases}
              onClose={() => setShowHistory(false)}
              onRollback={rollback}
            />
          )}
        </div>
      </div>
    );
  }

  // --- Desktop: file tree | editor | live preview ---
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 250, borderRight: "1px solid #1f242b", padding: 12, overflow: "auto" }}>
        <a href="/dashboard" style={{ color: "#60a5fa", fontSize: 13 }}>
          ← all sites
        </a>
        <EditableTitle
          value={name}
          onSave={renameProject}
          containerStyle={{ marginTop: 12 }}
          textStyle={{ fontSize: 15, fontWeight: 700 }}
        />
        {filesPanel}
      </aside>

      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid #1f242b",
          }}
        >
          {pathBar}
          <span style={{ flex: 1, fontSize: 12, color: "#9aa3ad" }}>{status}</span>
          {actions}
        </div>

        <div style={{ flex: 1, display: "flex", position: "relative" }}>
          <div style={{ flex: 1, minWidth: 0 }}>{codePanel}</div>
          <aside
            style={{
              width: 360,
              maxWidth: "38vw",
              borderLeft: "1px solid #1f242b",
              padding: 12,
              overflow: "auto",
              background: "#0b0d10",
            }}
          >
            {dataPanel}
          </aside>
          {sitePane("40%")}
          {showHistory && (
            <HistoryPanel
              releases={releases}
              onClose={() => setShowHistory(false)}
              onRollback={rollback}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/** Project name shown as a title; double-click or the ✎ button to rename inline. */
function EditableTitle({
  value,
  onSave,
  containerStyle,
  textStyle,
}: {
  value: string;
  onSave: (next: string) => void;
  containerStyle?: React.CSSProperties;
  textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={commit}
        style={{
          ...containerStyle,
          ...textStyle,
          background: "#0b0d10",
          border: "1px solid #3b82f6",
          borderRadius: 4,
          color: "#e6e8eb",
          padding: "2px 6px",
        }}
      />
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, ...containerStyle }}>
      <span
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename"
        style={{
          ...textStyle,
          color: "#e6e8eb",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "text",
        }}
      >
        {value}
      </span>
      <IconButton onClick={() => setEditing(true)} title="Rename site" color="#9aa3ad">
        ✎
      </IconButton>
    </span>
  );
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        background: "transparent",
        color: active ? "#e6e8eb" : "#9aa3ad",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function DataPanel({
  collections,
  active,
  records,
  loading,
  onInstallTemplate,
  onRefreshCollections,
  onLoadCollection,
  onUpdateRecord,
  onDeleteRecord,
}: {
  collections: DataCollection[];
  active: string;
  records: DataRecord[];
  loading: boolean;
  onInstallTemplate: () => void;
  onRefreshCollections: () => void;
  onLoadCollection: (collection: string) => void;
  onUpdateRecord: (id: string, status: DataRecord["status"]) => void;
  onDeleteRecord: (id: string) => void;
}) {
  return (
    <div style={{ color: "#e6e8eb", fontSize: 13 }}>
      <SectionHeader label="Backend API">
        <IconButton onClick={onInstallTemplate} title="Add lead form and backend function">
          +
        </IconButton>
        <IconButton onClick={onRefreshCollections} title="Refresh JSON database">
          ↻
        </IconButton>
      </SectionHeader>

      <div
        style={{
          marginTop: 8,
          padding: 10,
          border: "1px solid #1f242b",
          borderRadius: 6,
          background: "#101419",
        }}
      >
        <code style={{ display: "block", color: "#9aa3ad", fontSize: 12 }}>
          functions/api/lead.ts → POST /api/lead
        </code>
        <code style={{ display: "block", color: "#9aa3ad", fontSize: 12, marginTop: 4 }}>
          ctx.data.insert("leads", payload)
        </code>
      </div>

      <SectionHeader label="JSON DB">
        <span />
      </SectionHeader>

      {collections.length === 0 ? (
        <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0" }}>
          No records yet.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {collections.map((collection) => (
            <button
              key={collection.name}
              onClick={() => onLoadCollection(collection.name)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center",
                textAlign: "left",
                border: "1px solid #1f242b",
                borderRadius: 6,
                background: collection.name === active ? "#172033" : "#101419",
                color: "#e6e8eb",
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {collection.name}
              </span>
              <span style={badge("#1f2937", "#d1d5db")}>{collection.count}</span>
              <span style={{ gridColumn: "1 / -1", color: "#6b7280", fontSize: 11 }}>
                {collection.updatedAt ? new Date(collection.updatedAt).toLocaleString() : "empty"}
              </span>
            </button>
          ))}
        </div>
      )}

      <SectionHeader label={active || "Records"}>
        <IconButton onClick={() => onLoadCollection(active)} title="Load records">
          ↻
        </IconButton>
      </SectionHeader>

      {loading ? (
        <p style={{ fontSize: 12, color: "#9aa3ad" }}>Loading…</p>
      ) : records.length === 0 ? (
        <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0" }}>
          Open a collection to view records.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {records.map((record) => (
            <article
              key={record.id}
              style={{
                border: "1px solid #1f242b",
                borderRadius: 6,
                background: "#101419",
                padding: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, minWidth: 0, color: "#9aa3ad", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {record.id}
                </code>
                <select
                  value={record.status}
                  onChange={(event) => onUpdateRecord(record.id, event.target.value as DataRecord["status"])}
                  style={{
                    background: "#0b0d10",
                    color: "#e6e8eb",
                    border: "1px solid #2a313a",
                    borderRadius: 5,
                    fontSize: 12,
                    padding: "3px 5px",
                  }}
                >
                  <option value="new">new</option>
                  <option value="processing">processing</option>
                  <option value="done">done</option>
                  <option value="rejected">rejected</option>
                </select>
                <IconButton onClick={() => onDeleteRecord(record.id)} title="Delete record" color="#b91c1c">
                  ×
                </IconButton>
              </div>
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 11 }}>
                {new Date(record.createdAt).toLocaleString()}
              </div>
              <pre
                style={{
                  margin: "8px 0 0",
                  maxHeight: 220,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "#0b0d10",
                  borderRadius: 6,
                  padding: 8,
                  color: "#d1d5db",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(record.data, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** True on narrow (phone/small tablet) viewports; updates on resize/rotate. */
function useIsNarrow(breakpoint = 820): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return narrow;
}

/** Recursive file/folder tree with inline rename + drag-to-move. */
function Tree(props: {
  nodes: TreeNode[];
  depth: number;
  active: string;
  expanded: Set<string>;
  renaming: string | null;
  renameValue: string;
  dropTarget: string | null;
  dragActive: boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onStartRename: (node: TreeNode) => void;
  onRenameChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: (node: TreeNode) => void;
  onDragStart: (path: string) => void;
  onDropInto: (targetDir: string) => void;
  onDropTarget: (path: string | null) => void;
}) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
      {props.nodes.map((node) => {
        const isOpen = props.expanded.has(node.path);
        const isActive = node.path === props.active;
        const isRenaming = node.path === props.renaming;
        const isDrop = props.dropTarget === node.path && node.isDir;
        return (
          <li key={node.path}>
            <div
              draggable={!isRenaming}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData("text/plain", node.path);
                props.onDragStart(node.path);
              }}
              onDragOver={(e) => {
                if (props.dragActive && node.isDir) {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onDropTarget(node.path);
                }
              }}
              onDrop={(e) => {
                if (node.isDir) {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onDropInto(node.path);
                }
              }}
              onClick={() => (node.isDir ? props.onToggle(node.path) : props.onOpen(node.path))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 6px",
                paddingLeft: 6 + props.depth * 12,
                borderRadius: 6,
                cursor: "pointer",
                background: isActive ? "#1f242b" : isDrop ? "#16243b" : "transparent",
                color: "#e6e8eb",
              }}
            >
              <span style={{ width: 12, color: "#6b7280", fontSize: 10 }}>
                {node.isDir ? (isOpen ? "▼" : "▶") : ""}
              </span>
              <span style={{ width: 14 }}>{node.isDir ? "📁" : "📄"}</span>
              {isRenaming ? (
                <input
                  autoFocus
                  value={props.renameValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => props.onRenameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") props.onCommitRename();
                    if (e.key === "Escape") props.onCancelRename();
                  }}
                  onBlur={props.onCommitRename}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "#0b0d10",
                    border: "1px solid #3b82f6",
                    borderRadius: 4,
                    color: "#e6e8eb",
                    fontSize: 13,
                    padding: "1px 4px",
                  }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    props.onStartRename(node);
                  }}
                  title={`${node.path} — double-click to rename`}
                  style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {node.name}
                </span>
              )}
              {!isRenaming && (
                <>
                  <IconButton
                    onClick={() => props.onStartRename(node)}
                    title={`Rename ${node.name}`}
                    color="#9aa3ad"
                    stop
                  >
                    ✎
                  </IconButton>
                  <IconButton
                    onClick={() => props.onDelete(node)}
                    title={`Delete ${node.name}`}
                    color="#b91c1c"
                    stop
                  >
                    ×
                  </IconButton>
                </>
              )}
            </div>
            {node.isDir && isOpen && node.children && node.children.length > 0 && (
              <Tree {...props} nodes={node.children} depth={props.depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BinaryPreview({ path, url }: { path: string; url: string }) {
  const kind = mediaKind(path);
  const wrap: React.CSSProperties = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#0b0d10",
  };
  const stage: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    padding: 16,
  };
  return (
    <div style={wrap}>
      <div style={{ padding: "8px 12px", fontSize: 12, color: "#9aa3ad", borderBottom: "1px solid #1f242b" }}>
        Binary asset — preview only.{" "}
        <a href={url} download={basename(path)} style={{ color: "#60a5fa" }}>
          Download
        </a>
      </div>
      <div style={stage}>
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={path} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        )}
        {kind === "audio" && <audio controls src={url} style={{ width: "90%" }} />}
        {kind === "video" && (
          <video controls src={url} style={{ maxWidth: "100%", maxHeight: "100%" }} />
        )}
        {(kind === "pdf" || kind === "other") && (
          <iframe title={path} src={url} style={{ width: "100%", height: "100%", border: "none", background: "white" }} />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 18,
        borderTop: "1px solid #1f242b",
        paddingTop: 10,
      }}
    >
      <span style={{ fontSize: 11, color: "#9aa3ad", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ display: "flex", gap: 4 }}>{children}</span>
    </div>
  );
}

function PanelList({
  items,
  empty,
  onRemove,
}: {
  items: string[];
  empty: string;
  onRemove: (item: string) => void;
}) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>{empty}</p>;
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 12 }}>
      {items.map((item) => (
        <li key={item} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
          <span
            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={item}
          >
            {item}
          </span>
          <IconButton onClick={() => onRemove(item)} title={`Remove ${item}`} color="#b91c1c">
            ×
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function HistoryPanel({
  releases,
  onClose,
  onRollback,
  fullWidth = false,
}: {
  releases: Release[];
  onClose: () => void;
  onRollback: (version: number) => void;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: fullWidth ? "100%" : 320,
        maxWidth: "100%",
        height: "100%",
        background: "#0b0d10",
        borderLeft: "1px solid #1f242b",
        padding: 16,
        overflow: "auto",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>Version history</strong>
        <IconButton onClick={onClose} title="Close">
          ×
        </IconButton>
      </div>
      {releases.length === 0 ? (
        <p style={{ fontSize: 12, color: "#6b7280" }}>No releases yet. Publish to create one.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
          {releases.map((r) => (
            <li key={r.version} style={{ borderBottom: "1px solid #1f242b", padding: "10px 0", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>v{r.version}</strong>
                <button onClick={() => onRollback(r.version)} style={btn("#374151")}>
                  Rollback
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#9aa3ad", marginTop: 2 }}>{r.message || "—"}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  title,
  color = "#60a5fa",
  stop = false,
  children,
}: {
  onClick: () => void;
  title: string;
  color?: string;
  stop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        if (stop) e.stopPropagation();
        onClick();
      }}
      title={title}
      style={{
        background: "transparent",
        border: "none",
        color,
        cursor: "pointer",
        fontSize: 15,
        lineHeight: 1,
        padding: "2px 4px",
      }}
    >
      {children}
    </button>
  );
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  };
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  };
}
