import { DEFAULT_OPTION_VALUES } from "./options-schema";
import {
  readPersisted,
  STORAGE_KEY,
  toPersisted,
  type PersistedState,
} from "./persistence";
import { buildInitialTree, DEFAULT_FILES, stateToSave, useAppStore } from "./store";
import { findByPath, findFirstFile, genId, getAllFilePaths, getNodePath, sortNodes } from "./tree";
import type { FileTreeNode } from "./types";

/**
 * A temporary session's files kept (?temp, its banner's "Keep these
 * files"): written into the visitor's saved state, each folder at the root
 * under its name or, when the visitor's of that name holds other files,
 * NAME_2...; a file at the root whose name the visitor uses with another
 * text renamed N_1.c. Its workspaces, the folders it opened, its analysis
 * settings and the file open in it come along. Returns what to tell once
 * the page is loaded again without the link.
 */

// The saved state of a visitor who has none: the examples
function defaults(): PersistedState {
  const fileTree = buildInitialTree();
  return {
    version: 2,
    lang: "c",
    fileTree,
    activeFile: findFirstFile(fileTree),
    fileContents: { ...DEFAULT_FILES },
    codeByLang: {},
    configByLang: {},
    configXL: null,
    customConfigs: {},
    optionValues: DEFAULT_OPTION_VALUES,
    pyEntryPoint: null,
    autoRun: true,
    activePanel: "files",
    openCategories: {},
    opened: [],
  };
}

// The path made a node of the tree (and its folders), its id
function insertPath(tree: FileTreeNode[], path: string, folder: boolean): string {
  const parts = path.split("/");
  let level = tree;
  let id = "";
  parts.forEach((name, i) => {
    const last = i === parts.length - 1;
    const isFolder = !last || folder;
    let node = level.find((n) => n.name === name && (n.children !== undefined) === isFolder);
    if (!node) {
      node = { id: genId(), name, ...(isFolder ? { children: [] } : {}) };
      level.push(node);
    }
    id = node.id;
    level = node.children ?? [];
  });
  return id;
}

const same = (a: string | undefined, b: string) =>
  a !== undefined && a.replace(/\n$/, "") === b.replace(/\n$/, "");

export function keepTemporary(): { kept: number; told: string[] } {
  const session = toPersisted(stateToSave(useAppStore.getState()));
  const user = readPersisted() ?? defaults();
  const tree: FileTreeNode[] = JSON.parse(JSON.stringify(user.fileTree));
  const contents = { ...user.fileContents };
  const told: string[] = [];

  // Each folder at the root, where it goes
  const head = (p: string) => p.split("/")[0];
  const files = Object.entries(session.fileContents);
  const renamed = new Map<string, string>();
  for (const top of session.fileTree.filter((n) => n.children)) {
    const inside = files.filter(([p]) => p.startsWith(`${top.name}/`));
    const fits = (to: string) => {
      const node = findByPath(tree, to);
      if (!node) return true;
      if (!node.children) return false;
      const mine = Object.keys(contents).filter((p) => p.startsWith(`${to}/`));
      return (
        mine.length === inside.length &&
        inside.every(([p, t]) => same(contents[to + p.slice(top.name.length)], t))
      );
    };
    let to = top.name;
    for (let i = 2; !fits(to); i++) to = `${top.name}_${i}`;
    renamed.set(top.name, to);
    if (to !== top.name)
      told.push(
        `The folder ${top.name}/ already holds other files: the session's are in ${to}/, yours are unchanged`,
      );
  }
  const rootNames = new Map<string, string>();
  for (const [p, text] of files.filter(([p]) => !p.includes("/"))) {
    let name = p;
    for (let i = 1; contents[name] !== undefined && !same(contents[name], text); i++)
      name = p.replace(/(\.[^./]*)?$/, `_${i}$1`);
    rootNames.set(p, name);
  }
  const move = (p: string) => {
    if (!p.includes("/")) return rootNames.get(p) ?? p;
    const h = head(p);
    return (renamed.get(h) ?? h) + p.slice(h.length);
  };
  const moveFolder = (p: string) => move(`${p}/`).slice(0, -1);

  for (const [p, text] of files) {
    insertPath(tree, move(p), false);
    contents[move(p)] = text;
  }
  // (its folders without files, its workspaces)
  const walk = (nodes: FileTreeNode[], prefix: string) => {
    for (const n of nodes) {
      if (!n.children) continue;
      const path = prefix ? `${prefix}/${n.name}` : n.name;
      insertPath(tree, moveFolder(path), true);
      if (n.isWorkspace) {
        const node = findByPath(tree, moveFolder(path))!;
        node.isWorkspace = true;
        if (n.mode) node.mode = n.mode;
      }
      walk(n.children, path);
    }
  };
  walk(session.fileTree, "");

  const sorted = sortNodes(tree);
  const activePath = session.activeFile && getNodePath(session.fileTree, session.activeFile);
  const active = activePath
    ? getAllFilePaths(sorted).find((f) => f.path === move(activePath))?.id
    : undefined;
  const opened = session.opened?.map((o) => ({ ...o, folder: moveFolder(o.folder) })) ?? [];
  const kept: PersistedState = {
    ...user,
    fileTree: sorted,
    fileContents: contents,
    activeFile: active ?? user.activeFile,
    lang: session.lang,
    codeByLang: session.codeByLang,
    configByLang: session.configByLang,
    configXL: session.configXL,
    customConfigs: { ...user.customConfigs, ...session.customConfigs },
    optionValues: session.optionValues,
    pyEntryPoint: session.pyEntryPoint && "/" + move(session.pyEntryPoint.replace(/^\//, "")),
    opened: [
      ...(user.opened ?? []).filter((o) => !opened.some((n) => n.folder === o.folder)),
      ...opened,
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  return { kept: files.length, told };
}

/** The page's URL without what a link brought (the session kept). */
export function withoutLink(): string {
  const params = new URLSearchParams(location.search);
  for (const p of ["temp", "open", "file"]) params.delete(p);
  return location.pathname + (params.size ? `?${params}` : "");
}

export const KEPT_KEY = "mopsa-kept";

/** Whether the page is being left for the kept files (no question then). */
export let leaving = false;

/**
 * The session's files kept, then the page loaded again without the link,
 * what was kept told there (components/LinkBanners.tsx).
 */
export function keepAndLeave() {
  let told: string;
  try {
    const r = keepTemporary();
    told = [`Kept ${r.kept} files in this browser`, ...r.told].join(". ");
  } catch (e) {
    told = `Not all the files were kept (${(e as Error).message})`;
  }
  try {
    sessionStorage.setItem(KEPT_KEY, told);
  } catch {
    /* no sessionStorage */
  }
  leaving = true;
  location.replace(withoutLink());
}
