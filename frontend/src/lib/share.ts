import { DEFAULT_OPTION_VALUES } from "./options-schema";
import { readFile } from "./mopsa-client";
import { useAppStore } from "./store";
import {
  getAllFilePaths,
  getNodePath,
  getWorkspaceForFile,
  uniqueNameInLevel,
} from "./tree";
import type { FileTreeNode, WorkspaceMode } from "./types";

/**
 * Permalinks: the active workspace (files, config, options) packed into the
 * URL fragment, so a link reproduces an analysis without any server. The
 * fragment never reaches the server; it is deflated and base64url-encoded.
 */

interface SharePayload {
  v: 1;
  /** Workspace name (or "" when the shared file lives at the root). */
  ws: string;
  mode?: WorkspaceMode;
  /** Path relative to the workspace → content. */
  files: Record<string, string>;
  active: string;
  /** The config text when edited, else the preset name. */
  config?: string;
  preset?: string;
  /** Options that differ from the defaults. */
  options: Record<string, unknown>;
  pyEntry?: string;
}

const PREFIX = "#share=";

async function pipe(data: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function collectPayload(): SharePayload | null {
  const s = useAppStore.getState();
  if (!s.activeFile) return null;
  const activePath = getNodePath(s.fileTree, s.activeFile);
  if (!activePath) return null;
  const ws = getWorkspaceForFile(s.fileTree, s.activeFile) ?? "";
  const prefix = ws ? ws + "/" : "";

  const files: Record<string, string> = {};
  for (const { path } of getAllFilePaths(s.fileTree)) {
    if (ws ? !path.startsWith(prefix) : path !== activePath) continue;
    files[path.slice(prefix.length)] = readFile("/" + path);
  }

  const options: Record<string, unknown> = {};
  for (const [flag, value] of Object.entries(s.optionValues)) {
    if (flag === "__backend") continue;
    if (value !== undefined && value !== DEFAULT_OPTION_VALUES[flag])
      options[flag] = value;
  }

  const wsNode = ws ? nodeAtPath(ws) : null;
  return {
    v: 1,
    ws: ws.split("/").pop() ?? ws,
    ...(wsNode?.mode ? { mode: wsNode.mode } : {}),
    files,
    active: activePath.slice(prefix.length),
    ...(s.configDirty ? { config: s.configText } : { preset: s.configPreset }),
    options,
    ...(s.pyEntryPoint && s.pyEntryPoint.startsWith("/" + prefix)
      ? { pyEntry: s.pyEntryPoint.slice(prefix.length + 1) }
      : {}),
  };
}

/** The folder at `path` ("a/b") in the tree. */
function nodeAtPath(path: string): FileTreeNode | null {
  let level = useAppStore.getState().fileTree;
  let node: FileTreeNode | null = null;
  for (const name of path.split("/")) {
    node = level.find((n) => n.name === name && n.children) ?? null;
    if (!node) return null;
    level = node.children!;
  }
  return node;
}

/** A link reproducing the active workspace, or null if nothing is open. */
export async function createShareLink(): Promise<string | null> {
  const payload = collectPayload();
  if (!payload) return null;
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed =
    typeof CompressionStream !== "undefined"
      ? "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))
      : "j" + toBase64Url(json);
  return location.origin + location.pathname + PREFIX + packed;
}

async function readPayload(hash: string): Promise<SharePayload | null> {
  if (!hash.startsWith(PREFIX)) return null;
  const packed = hash.slice(PREFIX.length);
  try {
    let bytes = fromBase64Url(packed.slice(1));
    if (packed[0] === "z")
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    return p && p.v === 1 && p.files && typeof p.active === "string" ? p : null;
  } catch {
    return null;
  }
}

/**
 * Imports the workspace of a share link found in the URL, as a new
 * workspace (the user's own files are left alone), and selects it.
 * Returns the imported workspace name, or null without a share link.
 */
export async function importSharedWorkspace(
  presets: shareData,
): Promise<string | null> {
  const p = await readPayload(location.hash);
  if (!p) return null;
  history.replaceState(null, "", location.pathname + location.search);

  const store = useAppStore.getState();
  const id = store.createWorkspaceNode(null);
  const name = uniqueNameInLevel(
    useAppStore.getState().fileTree.filter((n) => n.id !== id),
    p.ws || "shared",
  );
  store.renameNode(id, name);
  store.importFiles(
    Object.entries(p.files).map(([path, content]) => ({ path, content })),
    id,
  );
  if (p.mode) store.setWorkspaceMode(id, p.mode);

  const s = useAppStore.getState();
  const active = getAllFilePaths(s.fileTree).find(
    (f) => f.path === `${name}/${p.active}`,
  );
  if (active) s.selectFile(active.id);
  s.setPyEntryPoint(p.pyEntry ? `/${name}/${p.pyEntry}` : null);

  // Options: the link's values over the defaults.
  for (const [flag, def] of Object.entries(DEFAULT_OPTION_VALUES)) {
    if (flag === "__backend") continue;
    const v = flag in p.options ? p.options[flag] : def;
    if (useAppStore.getState().optionValues[flag] !== v)
      useAppStore.getState().setOptionValue(flag, v);
  }
  for (const [flag, v] of Object.entries(p.options))
    if (!(flag in DEFAULT_OPTION_VALUES))
      useAppStore.getState().setOptionValue(flag, v);

  // Config last: selecting the file swapped in the language's bucket.
  const after = useAppStore.getState();
  if (p.config !== undefined) after.setConfigText(p.config, true);
  else if (p.preset) {
    const lang = after.lang as keyof shareData["configs"];
    const text = presets.configs[lang]?.[p.preset];
    if (text) after.applyPreset(p.preset, text);
  }
  return name;
}
