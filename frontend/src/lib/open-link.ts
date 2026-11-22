import { create } from "zustand";
import { readFile, setCodeFilePath } from "./mopsa-client";
import { fetchProject, isSource, openable, type RemoteFile } from "./remote";
import { temporary } from "./session";
import { applySettings, importShared, readShared } from "./share";
import { useAppStore } from "./store";
import { findByPath, getAllFilePaths, getDescendantFiles, getNodePath } from "./tree";
import type { FileTreeNode } from "./types";

/**
 * Opens what the page's link brings: the files of its fragment (#share=),
 * the folders of ?open=SPEC (a GitHub repository or one of its folders, or
 * an archive's URL), each a workspace at the root named after it (NAME_2...
 * when the visitor's folder of that name holds other files, told), the file
 * ?file=NAME names in them, else the link's own, else the first source; the
 * link's analysis settings last. The URL is then cleaned, unless the
 * session is temporary (its files fetched again at each load). A temporary
 * session's examples make way for the link's files.
 */

const params = new URLSearchParams(location.search);
export const openedSpecs = [
  ...new Set(params.getAll("open").map((s) => s.trim()).filter(Boolean)),
];

/** What is being fetched, the last error, a folder renamed. */
export const useLinkStatus = create<{
  progress: string | null;
  error: string | null;
  notice: string | null;
  dismiss: () => void;
}>((set) => ({
  progress: null,
  error: null,
  notice: null,
  dismiss: () => set({ error: null, notice: null }),
}));
const status = (s: Partial<ReturnType<typeof useLinkStatus.getState>>) =>
  useLinkStatus.setState(s);

/** Whether the link brought anything to open. */
export const hasLink = () =>
  location.hash.startsWith("#share=") || openedSpecs.length > 0;

/**
 * The folder at the root where a link's files go: NAME, else NAME_2... when
 * the visitor's holds other files (the same files: NAME, opened again).
 */
function freeFolder(name: string, files: RemoteFile[], tree: FileTreeNode[]) {
  const fits = (to: string) => {
    const node = findByPath(tree, to);
    if (!node) return true;
    if (!node.children) return false;
    const mine = getDescendantFiles(node)
      .map((f) => getNodePath(tree, f.id))
      .filter((p): p is string => p !== null && p !== to);
    if (mine.length !== files.length) return false;
    const theirs = new Map(files.map((f) => [`${to}/${f.path}`, f.content]));
    const same = (a: string, b: string) => a.replace(/\n$/, "") === b.replace(/\n$/, "");
    return mine.every((p) => theirs.has(p) && same(theirs.get(p)!, readFile("/" + p)));
  };
  let to = name;
  for (let i = 2; !fits(to); i++) to = `${name}_${i}`;
  return to;
}

// A folder of ?open=, fetched
async function fetchFolder(spec: string) {
  if (!openable(spec))
    throw new Error(
      `?open=${spec} is neither a GitHub repository (owner/repo[@ref][:folder]) nor an archive's URL`,
    );
  status({ progress: `fetching ${spec}` });
  const project = await fetchProject(spec, (done, total) =>
    status({ progress: `fetching ${spec}: ${done} of ${total} files` }),
  );
  if (project.files.length === 0)
    throw new Error(`${spec} has no C, Python or Universal sources`);
  return { spec, ...project };
}

// Its files in a workspace at the root, recorded with their source
function importFolder({
  spec,
  name,
  files,
  pinned,
}: Awaited<ReturnType<typeof fetchFolder>>): { to: string; paths: string[] } {
  const to = freeFolder(name, files, useAppStore.getState().fileTree);
  if (to !== name)
    status({
      notice: `The folder ${name}/ already holds other files: the link's files are in ${to}/, yours are unchanged`,
    });
  useAppStore
    .getState()
    .importFiles(files.map((f) => ({ path: `${to}/${f.path}`, content: f.content })));
  useAppStore.getState().markWorkspaces([{ path: to }]);
  const opened = useAppStore.getState().opened.filter((o) => o.folder !== to);
  useAppStore.getState().setOpened([
    ...opened,
    { folder: to, source: spec, ...(pinned ? { pinned } : {}) },
  ]);
  return { to, paths: files.map((f) => `${to}/${f.path}`) };
}

function forget() {
  if (temporary) return;
  const p = new URLSearchParams(location.search);
  p.delete("open");
  p.delete("file");
  history.replaceState(null, "", location.pathname + (p.size ? `?${p}` : ""));
}

export async function openLink(presets: shareData): Promise<void> {
  if (!hasLink()) return;
  const shared = await readShared();
  const fetched: Awaited<ReturnType<typeof fetchFolder>>[] = [];
  for (const spec of openedSpecs)
    try {
      fetched.push(await fetchFolder(spec));
    } catch (e) {
      status({ error: (e as Error).message });
    }
  status({ progress: null });

  // (a temporary session: the examples, untouched, make way for the link's
  // files; the editor on no file until one is opened)
  const sharedFiles = shared?.files.length ?? 0;
  if (temporary && (sharedFiles || fetched.length)) {
    const s = useAppStore.getState();
    s.deleteNodes(s.fileTree.map((n) => n.id));
    setCodeFilePath("/.mopsa-none");
  }

  let active: string | null = null;
  let moved = (p: string) => p;
  const imported: string[] = [];
  if (shared && sharedFiles) {
    moved = importShared(shared);
    imported.push(...shared.files.map(([p]) => moved(p)));
    if (shared.active) active = moved(shared.active);
  }
  const opened = fetched.map(importFolder);

  const file = params.get("file");
  const all = opened.flatMap((o) => o.paths);
  const named = file
    ? (opened.flatMap((o) => o.paths.filter((p) => p === `${o.to}/${file}`))[0] ??
      all.find((p) => p.endsWith(`/${file}`)))
    : undefined;
  active = named ?? active ?? all.find(isSource) ?? imported.find(isSource) ?? imported[0] ?? null;
  if (active) {
    const s = useAppStore.getState();
    const node = getAllFilePaths(s.fileTree).find((f) => f.path === active);
    if (node) s.selectFile(node.id);
  }
  if (shared?.settings) applySettings(shared.settings, presets, moved);
  if (!temporary) history.replaceState(null, "", location.pathname + location.search);
  if (opened.length) forget();
}
