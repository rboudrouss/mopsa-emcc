import type { FileTreeNode, SupportedLanguage, WorkspaceMode } from "./types";

export function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function insertNode(
  tree: FileTreeNode[],
  parentId: string | null,
  node: FileTreeNode,
): FileTreeNode[] {
  if (parentId === null) return [...tree, node];
  return tree.map((n) => {
    if (n.id === parentId && n.children !== undefined) {
      return { ...n, children: [...n.children, node] };
    }
    if (n.children)
      return { ...n, children: insertNode(n.children, parentId, node) };
    return n;
  });
}

export function removeNodes(
  tree: FileTreeNode[],
  ids: Set<string>,
): FileTreeNode[] {
  return tree
    .filter((n) => !ids.has(n.id))
    .map((n) =>
      n.children ? { ...n, children: removeNodes(n.children, ids) } : n,
    );
}

export function findById(
  tree: FileTreeNode[],
  id: string,
): FileTreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function getNodePath(
  tree: FileTreeNode[],
  id: string,
  prefix = "",
): string | null {
  for (const n of tree) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.id === id) return path;
    if (n.children) {
      const found = getNodePath(n.children, id, path);
      if (found) return found;
    }
  }
  return null;
}

export function renameNodeById(
  tree: FileTreeNode[],
  id: string,
  newName: string,
): FileTreeNode[] {
  return tree.map((n) => {
    if (n.id === id) return { ...n, name: newName };
    if (n.children)
      return { ...n, children: renameNodeById(n.children, id, newName) };
    return n;
  });
}

export function moveNodesInTree(
  tree: FileTreeNode[],
  dragIds: string[],
  parentId: string | null,
): FileTreeNode[] {
  const dragSet = new Set(dragIds);
  const dragged: FileTreeNode[] = [];

  function extract(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes
      .map((n): FileTreeNode | null => {
        if (dragSet.has(n.id)) {
          dragged.push(n);
          return null;
        }
        if (n.children) return { ...n, children: extract(n.children) };
        return n;
      })
      .filter((n): n is FileTreeNode => n !== null);
  }

  const pruned = extract(tree);

  if (parentId === null) return [...pruned, ...dragged];

  function insert(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes.map((n) => {
      if (n.id === parentId && n.children !== undefined) {
        return { ...n, children: [...n.children, ...dragged] };
      }
      if (n.children) return { ...n, children: insert(n.children) };
      return n;
    });
  }

  return insert(pruned);
}

export function getDescendantFiles(node: FileTreeNode): FileTreeNode[] {
  if (!node.children) return [node];
  return node.children.flatMap(getDescendantFiles);
}

export function countAllNodes(nodes: FileTreeNode[]): number {
  return nodes.reduce(
    (acc, n) => acc + 1 + (n.children ? countAllNodes(n.children) : 0),
    0,
  );
}

export function findFirstFile(tree: FileTreeNode[]): string | null {
  for (const n of tree) {
    if (!n.children) return n.id;
    const found = findFirstFile(n.children);
    if (found) return found;
  }
  return null;
}

export function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const aFolder = a.children !== undefined;
    const bFolder = b.children !== undefined;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((n) =>
    n.children ? { ...n, children: sortNodes(n.children) } : n,
  );
}

export function getSiblings(
  tree: FileTreeNode[],
  id: string,
): FileTreeNode[] | null {
  if (tree.some((n) => n.id === id)) return tree;
  for (const n of tree) {
    if (n.children) {
      const found = getSiblings(n.children, id);
      if (found !== null) return found;
    }
  }
  return null;
}

export function getChildrenOf(
  tree: FileTreeNode[],
  parentId: string | null,
): FileTreeNode[] {
  if (parentId === null) return tree;
  const parent = findById(tree, parentId);
  return parent?.children ?? [];
}

export function uniqueNameInLevel(
  level: FileTreeNode[],
  baseName: string,
  excludeId?: string,
): string {
  const taken = new Set(
    level.filter((n) => n.id !== excludeId).map((n) => n.name),
  );
  if (!taken.has(baseName)) return baseName;
  let i = 1;
  while (taken.has(`${baseName}_${i}`)) i++;
  return `${baseName}_${i}`;
}

export function toggleWorkspaceById(
  tree: FileTreeNode[],
  id: string,
): FileTreeNode[] {
  return tree.map((n) => {
    if (n.id === id) return { ...n, isWorkspace: !n.isWorkspace };
    if (n.children)
      return { ...n, children: toggleWorkspaceById(n.children, id) };
    return n;
  });
}

// Returns the path of the deepest workspace ancestor of the given file node,
// i.e. the first workspace encountered when traversing up from the file.
export function getWorkspaceForFile(
  tree: FileTreeNode[],
  fileId: string,
): string | null {
  function findAncestors(
    nodes: FileTreeNode[],
    targetId: string,
    acc: { node: FileTreeNode; path: string }[],
    prefix: string,
  ): { node: FileTreeNode; path: string }[] | null {
    for (const n of nodes) {
      const path = prefix ? `${prefix}/${n.name}` : n.name;
      if (n.id === targetId) return acc;
      if (n.children) {
        const found = findAncestors(
          n.children,
          targetId,
          [...acc, { node: n, path }],
          path,
        );
        if (found) return found;
      }
    }
    return null;
  }

  const ancestors = findAncestors(tree, fileId, [], "");
  if (!ancestors) return null;

  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].node.isWorkspace) return ancestors[i].path;
  }
  return null;
}

export function getAllFilePaths(
  nodes: FileTreeNode[],
  prefix = "",
): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = [];
  for (const n of nodes) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (!n.children) {
      result.push({ id: n.id, path });
    } else {
      result.push(...getAllFilePaths(n.children, path));
    }
  }
  return result;
}

// Walks a workspace's descendants, aggregates extensions, returns the inferred mode.
export function detectWorkspaceMode(node: FileTreeNode): WorkspaceMode {
  let hasC = false;
  let hasPy = false;
  let hasU = false;

  for (const file of getDescendantFiles(node)) {
    const dot = file.name.lastIndexOf(".");
    if (dot < 0) continue;
    const ext = file.name.slice(dot + 1).toLowerCase();
    if (ext === "c" || ext === "h") hasC = true;
    else if (ext === "py") hasPy = true;
    else if (ext === "u") hasU = true;
  }

  if (hasC && hasPy) return "multilanguage";
  if (hasPy) return "python";
  if (hasC) return "c";
  if (hasU) return "universal";
  return "unknown";
}

// Cascade: manual override > auto-detection
export function getEffectiveWorkspaceMode(node: FileTreeNode): WorkspaceMode {
  if (node.mode) return node.mode;
  return detectWorkspaceMode(node);
}

// Returns the deepest workspace ancestor node containing the given file.
export function findWorkspaceNodeForFile(
  tree: FileTreeNode[],
  fileId: string,
): FileTreeNode | null {
  function walk(
    nodes: FileTreeNode[],
    ancestors: FileTreeNode[],
  ): FileTreeNode | null {
    for (const n of nodes) {
      if (n.id === fileId) {
        for (let i = ancestors.length - 1; i >= 0; i--) {
          if (ancestors[i].isWorkspace) return ancestors[i];
        }
        return null;
      }
      if (n.children) {
        const found = walk(n.children, [...ancestors, n]);
        if (found !== null) return found;
      }
    }
    return null;
  }
  return walk(tree, []);
}

export function setWorkspaceModeById(
  tree: FileTreeNode[],
  id: string,
  mode: WorkspaceMode | undefined,
): FileTreeNode[] {
  return tree.map((n) => {
    if (n.id === id) {
      const next: FileTreeNode = { ...n };
      if (mode === undefined) delete next.mode;
      else next.mode = mode;
      return next;
    }
    if (n.children)
      return { ...n, children: setWorkspaceModeById(n.children, id, mode) };
    return n;
  });
}

// Resolves the analysis mode for the currently active file:
// workspace override > workspace auto-detect > fallback to active file lang.
export function getActiveAnalysisMode(args: {
  fileTree: FileTreeNode[];
  activeFile: string | null;
  lang: SupportedLanguage;
}): WorkspaceMode {
  if (args.activeFile) {
    const ws = findWorkspaceNodeForFile(args.fileTree, args.activeFile);
    if (ws) {
      const mode = getEffectiveWorkspaceMode(ws);
      if (mode !== "unknown") return mode;
    }
  }
  return args.lang;
}
