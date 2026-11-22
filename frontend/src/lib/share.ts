import { DEFAULT_OPTION_VALUES } from "./options-schema";
import { readFile } from "./mopsa-client";
import { useAppStore } from "./store";
import { findByPath, getAllFilePaths, getNodePath } from "./tree";
import type { FileTreeNode, WorkspaceMode } from "./types";

/**
 * Links: files, and the analysis settings, packed into the URL fragment
 * (#share=, deflated and base64url-encoded), so that a link reproduces an
 * analysis without any server. The fragment never reaches the server. The
 * query adds what is fetched again rather than carried (?open=SPEC, a
 * repository's folder or an archive; ?file=NAME the one opened in it) and
 * how the page opens (?temp: a temporary session, ?embed: embedded).
 */

/** The analysis settings a link carries. */
export interface SharedSettings {
  /** The config text when edited, else the preset name. */
  config?: string;
  preset?: string;
  /** Options that differ from the defaults. */
  options: Record<string, unknown>;
  /** The Python entry point, when one is set. */
  pyEntry?: string;
}

/** What a link carries: files by path, the workspaces among their folders. */
export interface Shared {
  files: [string, string][];
  active: string | null;
  workspaces: { path: string; mode?: WorkspaceMode }[];
  settings?: SharedSettings;
}

// The first links held one workspace, its paths relative to it.
interface SharePayloadV1 {
  v: 1;
  ws: string;
  mode?: WorkspaceMode;
  files: Record<string, string>;
  active: string;
  config?: string;
  preset?: string;
  options: Record<string, unknown>;
  pyEntry?: string;
}

type SharePayload = { v: 2 } & Shared;

const PREFIX = "#share=";

async function pipe(data: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
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

// ── What the page shares ──────────────────────────────────────────────────────

/** The analysis settings of the page: config, options, entry point. */
export function currentSettings(): SharedSettings {
  const s = useAppStore.getState();
  const options: Record<string, unknown> = {};
  for (const [flag, value] of Object.entries(s.optionValues)) {
    if (flag === "__backend") continue;
    if (value !== undefined && value !== DEFAULT_OPTION_VALUES[flag])
      options[flag] = value;
  }
  return {
    ...(s.configDirty ? { config: s.configText } : { preset: s.configPreset }),
    options,
    ...(s.pyEntryPoint ? { pyEntry: s.pyEntryPoint.replace(/^\//, "") } : {}),
  };
}

/** The path of the active file, "" if none. */
export function activePath(): string {
  const s = useAppStore.getState();
  return (s.activeFile && getNodePath(s.fileTree, s.activeFile)) || "";
}

/** The paths of the workspaces of the tree, with their mode when forced. */
export function workspacesOf(tree: FileTreeNode[]) {
  const out: { path: string; mode?: WorkspaceMode }[] = [];
  const walk = (nodes: FileTreeNode[], prefix: string) => {
    for (const n of nodes) {
      if (!n.children) continue;
      const path = prefix ? `${prefix}/${n.name}` : n.name;
      if (n.isWorkspace) out.push({ path, ...(n.mode ? { mode: n.mode } : {}) });
      walk(n.children, path);
    }
  };
  walk(tree, "");
  return out;
}

/**
 * These files of the page, the workspaces that hold some of them, and the
 * analysis settings if asked.
 */
export function collectShared(paths: string[], settings: boolean): Shared {
  const s = useAppStore.getState();
  const active = activePath();
  const within = (p: string, dir: string) => p.startsWith(`${dir}/`);
  return {
    files: paths.map((p) => [p, readFile("/" + p)]),
    active: paths.includes(active) ? active : null,
    workspaces: workspacesOf(s.fileTree).filter((w) =>
      paths.some((p) => within(p, w.path)),
    ),
    ...(settings ? { settings: currentSettings() } : {}),
  };
}

/**
 * A link to the page with these files (none: no fragment), the folders it
 * opens from their source (?open=SPEC each, ?file=NAME the one shown), a
 * temporary session (?temp, first).
 */
export async function shareUrl(
  shared: Shared | null,
  base = location.origin + location.pathname,
  opens: { open: string[]; file?: string; temp?: boolean } = { open: [] },
): Promise<string> {
  const url = new URL(base);
  for (const p of ["open", "file", "temp", "embed"]) url.searchParams.delete(p);
  for (const o of opens.open) url.searchParams.append("open", o);
  if (opens.open.length && opens.file) url.searchParams.set("file", opens.file);
  if (opens.temp) {
    const rest = url.searchParams.toString();
    url.search = `?temp${rest ? `&${rest}` : ""}`;
  }
  if (!shared || (shared.files.length === 0 && !shared.settings)) {
    url.hash = "";
    return url.href;
  }
  const payload: SharePayload = { v: 2, ...shared };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed =
    typeof CompressionStream !== "undefined"
      ? "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))
      : "j" + toBase64Url(json);
  url.hash = PREFIX.slice(1) + packed;
  return url.href;
}

/** A link made the page's embedded version (?embed, first). */
export function embedUrl(link: string): string {
  if (!link) return "";
  const url = new URL(link);
  url.searchParams.delete("temp");
  const rest = url.searchParams.toString();
  url.search = `?embed${rest ? `&${rest}` : ""}`;
  return url.href;
}

// The HTML that embeds it in another page (allow: the iframe cross-origin
// isolated when that page is)
const attribute = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export const embedCode = (src: string) =>
  `<iframe src="${attribute(src)}" title="Mopsa" width="100%" height="500" ` +
  `style="border: 1px solid #ccc; border-radius: 6px" allow="cross-origin-isolated" loading="lazy"></iframe>`;

// The longest links: those that chats, mail and some sites may cut, and
// those that Chrome and Edge do not open (2 MB)
export const longUrl = 8 * 1024;
export const maxUrl = 2 * 1024 * 1024;

// ── What a link brings ────────────────────────────────────────────────────────

const strings = (l: unknown): l is string[] =>
  Array.isArray(l) && l.every((x) => typeof x === "string");
const validPath = (p: string) =>
  p.length > 0 && !p.startsWith("/") && p.split("/").every((n) => n && n !== "." && n !== "..");

function fromV1(p: SharePayloadV1): Shared {
  const ws = p.ws || "shared";
  return {
    files: Object.entries(p.files).map(([path, text]) => [`${ws}/${path}`, text]),
    active: `${ws}/${p.active}`,
    workspaces: [{ path: ws, ...(p.mode ? { mode: p.mode } : {}) }],
    settings: {
      ...(p.config !== undefined ? { config: p.config } : { preset: p.preset }),
      options: p.options ?? {},
      ...(p.pyEntry ? { pyEntry: `${ws}/${p.pyEntry}` } : {}),
    },
  };
}

/** The files of a link's fragment, null without any. */
export async function readShared(hash = location.hash): Promise<Shared | null> {
  if (!hash.startsWith(PREFIX)) return null;
  const packed = hash.slice(PREFIX.length);
  try {
    let bytes = fromBase64Url(packed.slice(1));
    if (packed[0] === "z")
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (p?.v === 1 && p.files && typeof p.active === "string") return fromV1(p);
    if (p?.v !== 2) return null;
    const files = (Array.isArray(p.files) ? p.files : []).filter(
      (f: unknown) => strings(f) && f.length === 2 && validPath(f[0]),
    );
    const settings = p.settings;
    return {
      files,
      active: typeof p.active === "string" ? p.active : null,
      workspaces: (Array.isArray(p.workspaces) ? p.workspaces : []).filter(
        (w: unknown) =>
          typeof (w as { path?: unknown })?.path === "string" &&
          validPath((w as { path: string }).path),
      ),
      ...(settings && typeof settings === "object"
        ? {
            settings: {
              ...(typeof settings.config === "string" ? { config: settings.config } : {}),
              ...(typeof settings.preset === "string" ? { preset: settings.preset } : {}),
              options:
                settings.options && typeof settings.options === "object"
                  ? settings.options
                  : {},
              ...(typeof settings.pyEntry === "string" ? { pyEntry: settings.pyEntry } : {}),
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Writes a link's files into the tree: a folder at the root whose files
 * the visitor has with other texts is renamed F_2 (F_3...), a file at the
 * root N_1.c; the workspaces made such. Returns where each path went.
 */
export function importShared(shared: Shared): (path: string) => string {
  const s = useAppStore.getState();
  const mine = new Set(getAllFilePaths(s.fileTree).map((f) => f.path));
  const differs = (path: string, text: string) =>
    mine.has(path) && readFile("/" + path).replace(/\n$/, "") !== text.replace(/\n$/, "");
  const top = (p: string) => (p.includes("/") ? p.split("/")[0] : null);
  const folders = new Map<string, string>();
  for (const f of new Set(shared.files.map(([p]) => top(p)).filter((t): t is string => t !== null))) {
    const inside = shared.files.filter(([p]) => top(p) === f);
    let to = f;
    for (
      let i = 2;
      inside.some(([p, t]) => differs(to + p.slice(f.length), t)) ||
      (findByPath(s.fileTree, to) && !findByPath(s.fileTree, to)!.children);
      i++
    )
      to = `${f}_${i}`;
    folders.set(f, to);
  }
  const roots = new Map<string, string>();
  for (const [p, text] of shared.files) {
    if (top(p) !== null) continue;
    let name = p;
    for (let i = 1; differs(name, text); i++) name = p.replace(/(\.[^./]*)?$/, `_${i}$1`);
    roots.set(p, name);
  }
  const moved = (p: string) => {
    const t = top(p);
    if (t === null) return roots.get(p) ?? p;
    return (folders.get(t) ?? t) + p.slice(t.length);
  };
  const movedFolder = (p: string) => moved(`${p}/`).slice(0, -1);
  s.importFiles(shared.files.map(([path, content]) => ({ path: moved(path), content })));
  const workspaces = shared.workspaces.map((w) => ({ ...w, path: movedFolder(w.path) }));
  if (workspaces.length) useAppStore.getState().markWorkspaces(workspaces);
  return moved;
}

/** Applies a link's analysis settings: its options over the defaults, its config. */
export function applySettings(
  settings: SharedSettings,
  presets: shareData,
  moved: (path: string) => string = (p) => p,
) {
  const store = () => useAppStore.getState();
  store().setPyEntryPoint(settings.pyEntry ? "/" + moved(settings.pyEntry) : null);
  for (const [flag, def] of Object.entries(DEFAULT_OPTION_VALUES)) {
    if (flag === "__backend") continue;
    const v = flag in settings.options ? settings.options[flag] : def;
    if (store().optionValues[flag] !== v) store().setOptionValue(flag, v);
  }
  for (const [flag, v] of Object.entries(settings.options))
    if (!(flag in DEFAULT_OPTION_VALUES) && flag !== "__backend")
      store().setOptionValue(flag, v);
  // Config last: selecting the file swapped in the language's bucket.
  const after = store();
  if (settings.config !== undefined) after.setConfigText(settings.config, true);
  else if (settings.preset) {
    const lang = after.lang as keyof shareData["configs"];
    const text = presets.configs[lang]?.[settings.preset];
    if (text) after.applyPreset(settings.preset, text);
  }
}
