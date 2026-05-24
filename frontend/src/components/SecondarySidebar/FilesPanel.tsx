import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist";
import {
  FilePlus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Upload,
  Download,
  Layers,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  countAllNodes,
  detectWorkspaceMode,
  getAllFilePaths,
  getEffectiveWorkspaceMode,
  getNodePath,
} from "@/lib/tree";
import { readFile } from "@/lib/mopsa-client";
import type {
  FileTreeNode,
  SupportedLanguage,
  WorkspaceMode,
} from "@/lib/types";

// ── Language chip ─────────────────────────────────────────────────────────────

const LANG_CHIP: Record<
  SupportedLanguage,
  { bg: string; color: string; label: string }
> = {
  c: { bg: "rgba(96,165,250,.15)", color: "#60a5fa", label: "C" },
  python: { bg: "rgba(251,191,36,.15)", color: "#fbbf24", label: "PY" },
  universal: { bg: "rgba(167,139,250,.15)", color: "#a78bfa", label: "UNI" },
};

const WORKSPACE_CHIP: Record<
  WorkspaceMode,
  { bg: string; color: string; label: string }
> = {
  c: { bg: "rgba(96,165,250,.15)", color: "#60a5fa", label: "C" },
  python: { bg: "rgba(251,191,36,.15)", color: "#fbbf24", label: "PY" },
  universal: { bg: "rgba(167,139,250,.15)", color: "#a78bfa", label: "UNI" },
  multilanguage: {
    bg: "rgba(245,181,68,.15)",
    color: "#f5b544",
    label: "C+PY",
  },
  unknown: { bg: "rgba(148,163,184,.15)", color: "#94a3b8", label: "?" },
};

function getFileLang(filename: string): SupportedLanguage | null {
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".u")) return "universal";
  if (filename.endsWith(".c") || filename.endsWith(".h")) return "c";
  return null;
}

// ── Import / download helpers ─────────────────────────────────────────────────

const SUPPORTED_IMPORT_EXTS = new Set([".c", ".h", ".py", ".u"]);

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function readImportFiles(
  fileList: FileList,
  useRelativePath: boolean,
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  for (const file of Array.from(fileList)) {
    const dotIdx = file.name.lastIndexOf(".");
    const ext = dotIdx >= 0 ? file.name.slice(dotIdx) : "";
    if (!SUPPORTED_IMPORT_EXTS.has(ext)) continue;
    try {
      const content = await file.text();
      if (content.includes("\0")) continue;
      const path = useRelativePath
        ? (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name
        : file.name;
      results.push({ path, content });
    } catch {
      /* skip unreadable */
    }
  }
  return results;
}

// ── Context menu state ────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string | null;
  isFolder: boolean;
}

type SetContextMenu = (state: ContextMenuState | null) => void;
const SetContextMenuCtx = createContext<SetContextMenu>(() => {});

// ── Workspace mode menu state (single instance, lifted to FilesPanel) ────────

interface WorkspaceModeMenuState {
  nodeId: string;
  x: number;
  y: number;
  currentMode: WorkspaceMode | undefined;
  // Auto-detected mode from the workspace's contents — drives which override
  // options are meaningful (e.g. a python-only workspace shouldn't offer "C only").
  detectedMode: WorkspaceMode;
}

interface WorkspaceModeMenuApi {
  state: WorkspaceModeMenuState | null;
  open: (s: WorkspaceModeMenuState) => void;
  close: () => void;
}

const WorkspaceModeMenuCtx = createContext<WorkspaceModeMenuApi>({
  state: null,
  open: () => {},
  close: () => {},
});

// ── Workspace mode override menu ──────────────────────────────────────────────

type ModeOption = {
  value: WorkspaceMode | undefined;
  label: string;
};

const AUTO_LABEL: Record<WorkspaceMode, string> = {
  c: "Auto (C)",
  python: "Auto (Python)",
  universal: "Auto (Universal)",
  multilanguage: "Auto (Multilang)",
  unknown: "Auto",
};

// Filters override options based on what files the workspace actually contains.
// Avoids dead-end choices like "C only" on a Python-only workspace.
function modeOptionsFor(detected: WorkspaceMode): ModeOption[] {
  const auto: ModeOption = { value: undefined, label: AUTO_LABEL[detected] };
  switch (detected) {
    case "multilanguage":
      // Workspace has both C/H and Python — let the user narrow to one language.
      return [
        auto,
        { value: "c", label: "C only" },
        { value: "python", label: "Python only" },
      ];
    case "c":
      return [auto, { value: "multilanguage", label: "Force Multilang (C+PY)" }];
    case "python":
      return [auto, { value: "multilanguage", label: "Force Multilang (C+PY)" }];
    case "universal":
      // Universal analysis is standalone — no meaningful override.
      return [auto];
    case "unknown":
      // Empty workspace — show every mode as a fallback so the user can prepare it.
      return [
        auto,
        { value: "c", label: "C" },
        { value: "python", label: "Python" },
        { value: "universal", label: "Universal" },
        { value: "multilanguage", label: "Multilang (C+PY)" },
      ];
  }
}

function WorkspaceModeMenu({
  state,
  ignoreNodeId,
  onPick,
  onClose,
}: {
  state: WorkspaceModeMenuState;
  // The badge that opened this menu — we ignore mousedown on it so re-clicking
  // it toggles instead of close-then-open.
  ignoreNodeId: string;
  onPick: (m: WorkspaceMode | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      // Ignore clicks on the same badge that opened the menu (toggle handled
      // by the badge's own onClick).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(`[data-workspace-badge="${ignoreNodeId}"]`)
      ) {
        return;
      }
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, ignoreNodeId]);

  const menuWidth = 170;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 4);
  const menuHeight = 220;
  const y = Math.min(state.y, window.innerHeight - menuHeight - 4);

  // Portal to body so position:fixed escapes any transformed ancestor
  // (react-arborist virtualisation applies transforms to its rows).
  return createPortal(
    <div
      ref={ref}
      // Stop click/mousedown from bubbling through the React portal back into
      // the FileRow (which would otherwise toggle the folder open/closed).
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        width: menuWidth,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        padding: 4,
        zIndex: 1000,
      }}
    >
      {modeOptionsFor(state.detectedMode).map((opt) => {
        const isCurrent = opt.value === state.currentMode;
        return (
          <button
            key={opt.label}
            onClick={(e) => {
              e.stopPropagation();
              onPick(opt.value);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 12px",
              background: isCurrent ? "var(--bg-hover)" : "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--text-primary)",
              textAlign: "left",
              borderRadius: 4,
              fontWeight: isCurrent ? 600 : 400,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                isCurrent ? "var(--bg-hover)" : "none";
            }}
          >
            {opt.label}
            {isCurrent && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Node renderer ─────────────────────────────────────────────────────────────

function FileRow({ node, style, dragHandle }: NodeRendererProps<FileTreeNode>) {
  const checks = useAppStore((s) => s.checks);
  const setContextMenu = useContext(SetContextMenuCtx);
  const workspaceModeMenu = useContext(WorkspaceModeMenuCtx);
  const isFolder = node.data.children !== undefined;
  const isWorkspace = isFolder && node.data.isWorkspace;
  const workspaceMode = isWorkspace
    ? getEffectiveWorkspaceMode(node.data)
    : null;
  const workspaceModeChip = workspaceMode ? WORKSPACE_CHIP[workspaceMode] : null;
  const isModeOverridden = isWorkspace && node.data.mode !== undefined;
  const isMenuOpenForThisRow =
    workspaceModeMenu.state?.nodeId === node.id;

  const warnings = !isFolder
    ? checks.filter(
        (c) =>
          c.range?.start &&
          (c.range.start.file.endsWith(node.data.name) ||
            c.range.start.file.endsWith("/" + node.data.name)) &&
          (c.kind === "warning" || c.kind === "error"),
      ).length
    : 0;

  const lang = !isFolder ? getFileLang(node.data.name) : null;
  const chip = lang ? LANG_CHIP[lang] : null;

  if (node.isEditing) {
    return (
      <div
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
        }}
      >
        <input
          autoFocus
          defaultValue={node.data.name}
          style={{
            flex: 1,
            background: "var(--bg-base)",
            border: "1px solid var(--color-accent)",
            borderRadius: 3,
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            padding: "1px 4px",
            outline: "none",
          }}
          onBlur={(e) => node.submit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") node.submit(e.currentTarget.value);
            if (e.key === "Escape") node.reset();
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 5,
        paddingRight: 12,
        paddingLeft: node.level * 12 + 6,
        cursor: "pointer",
        background: node.isSelected ? "var(--bg-hover)" : "transparent",
        transition: "background 120ms",
        userSelect: "none",
      }}
      onClick={() => {
        if (isFolder) node.toggle();
        else node.select();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          nodeId: node.id,
          isFolder,
        });
      }}
      onMouseEnter={(e) => {
        if (!node.isSelected)
          (e.currentTarget as HTMLDivElement).style.background =
            "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!node.isSelected)
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Chevron */}
      {isFolder ? (
        <span
          style={{ display: "flex", flexShrink: 0, color: "var(--text-muted)" }}
        >
          {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}

      {/* Icon */}
      <span
        style={{ display: "flex", flexShrink: 0, color: "var(--text-muted)" }}
      >
        {isFolder ? (
          node.isOpen ? (
            <FolderOpen size={14} />
          ) : (
            <Folder size={14} />
          )
        ) : (
          <File size={14} />
        )}
      </span>

      {/* Lang chip */}
      {chip && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 4px",
            borderRadius: 3,
            background: chip.bg,
            color: chip.color,
            flexShrink: 0,
            letterSpacing: "0.03em",
          }}
        >
          {chip.label}
        </span>
      )}

      {/* Name */}
      <span
        style={{
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {node.data.name}
      </span>

      {/* Warning badge */}
      {warnings > 0 && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#f5b544",
            flexShrink: 0,
          }}
        >
          ⚠{warnings}
        </span>
      )}

      {/* Workspace mode badge (clickable to open override menu) */}
      {isWorkspace && workspaceModeChip && (
        <button
          type="button"
          data-workspace-badge={node.id}
          title={
            isModeOverridden
              ? `Workspace mode: ${workspaceMode} (manual override — click to change)`
              : `Workspace mode: ${workspaceMode} (auto — click to override)`
          }
          onMouseDown={(e) => {
            // Prevent the row's mousedown / drag handle and stop the menu's
            // outside-click handler from firing on this same click.
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isMenuOpenForThisRow) {
              workspaceModeMenu.close();
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            workspaceModeMenu.open({
              nodeId: node.id,
              x: rect.left,
              y: rect.bottom + 4,
              currentMode: node.data.mode,
              detectedMode: detectWorkspaceMode(node.data),
            });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 4px",
            borderRadius: 3,
            background: isMenuOpenForThisRow
              ? workspaceModeChip.color
              : workspaceModeChip.bg,
            color: isMenuOpenForThisRow ? "#0f1117" : workspaceModeChip.color,
            flexShrink: 0,
            letterSpacing: "0.03em",
            border: isModeOverridden
              ? `1px solid ${workspaceModeChip.color}`
              : `1px solid ${workspaceModeChip.color}33`,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 120ms",
          }}
        >
          <Layers size={9} />
          {workspaceModeChip.label}
          <ChevronDown size={9} style={{ marginLeft: 1, opacity: 0.7 }} />
        </button>
      )}
    </div>
  );
}

// ── Context menu component ────────────────────────────────────────────────────

interface ContextMenuProps {
  state: ContextMenuState;
  treeRef: React.RefObject<TreeApi<FileTreeNode> | null>;
  onNewFile: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onNewWorkspace: (parentId: string | null) => void;
  onDelete: (id: string) => void;
  onImportFiles: (parentId: string | null) => void;
  onImportFolder: (parentId: string | null) => void;
  onDownloadFile: (id: string) => void;
  onToggleWorkspace: (id: string) => void;
  onClose: () => void;
}

function ContextMenu({
  state,
  treeRef,
  onNewFile,
  onNewFolder,
  onNewWorkspace,
  onDelete,
  onImportFiles,
  onImportFolder,
  onDownloadFile,
  onToggleWorkspace,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const menuWidth = 180;
  const menuHeight = 260;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 4);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 4);

  const newParentId =
    state.nodeId && state.isFolder
      ? state.nodeId
      : state.nodeId
        ? (treeRef.current?.get(state.nodeId)?.parent?.id ?? null)
        : null;

  function item(
    icon: React.ReactNode,
    label: string,
    action: () => void,
    danger = false,
  ) {
    return (
      <button
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          color: danger ? "#f87171" : "var(--text-primary)",
          textAlign: "left",
          borderRadius: 4,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
        onClick={() => {
          action();
          onClose();
        }}
      >
        {icon}
        {label}
      </button>
    );
  }

  const sep = (
    <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
  );

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: y,
        left: x,
        width: menuWidth,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        padding: 4,
        zIndex: 1000,
      }}
    >
      {item(<FilePlus size={13} />, "New File", () => onNewFile(newParentId))}
      {item(<FolderPlus size={13} />, "New Folder", () =>
        onNewFolder(newParentId),
      )}
      {item(<Layers size={13} />, "New Workspace", () =>
        onNewWorkspace(newParentId),
      )}

      {sep}
      {item(<Upload size={13} />, "Import files…", () =>
        onImportFiles(newParentId),
      )}
      {item(<Upload size={13} />, "Import folder…", () =>
        onImportFolder(newParentId),
      )}

      {state.nodeId && (
        <>
          {sep}
          {item(<Pencil size={13} />, "Rename", () => {
            if (state.nodeId) treeRef.current?.edit(state.nodeId);
          })}
          {!state.isFolder &&
            item(<Download size={13} />, "Download file", () => {
              if (state.nodeId) onDownloadFile(state.nodeId);
            })}
          {state.isFolder &&
            (() => {
              const isWs = treeRef.current?.get(state.nodeId!)?.data
                .isWorkspace;
              return item(
                <Layers size={13} />,
                isWs ? "Unmark workspace" : "Mark as workspace",
                () => {
                  if (state.nodeId) onToggleWorkspace(state.nodeId);
                },
              );
            })()}
          {sep}
          {item(
            <Trash2 size={13} />,
            "Delete",
            () => {
              if (state.nodeId) onDelete(state.nodeId);
            },
            true,
          )}
        </>
      )}
    </div>
  );
}

// ── Import dropdown (header button) ──────────────────────────────────────────

interface ImportMenuState {
  x: number;
  y: number;
}

function ImportMenu({
  state,
  onClose,
  onImportFiles,
  onImportFolder,
}: {
  state: ImportMenuState;
  onClose: () => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const menuWidth = 160;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 4);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: state.y,
        left: x,
        width: menuWidth,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        padding: 4,
        zIndex: 1000,
      }}
    >
      {(["files", "folder"] as const).map((type) => (
        <button
          key={type}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "6px 12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--text-primary)",
            textAlign: "left",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
          onClick={() => {
            if (type === "files") onImportFiles();
            else onImportFolder();
            onClose();
          }}
        >
          <Upload size={13} />
          {type === "files" ? "Import files…" : "Import folder…"}
        </button>
      ))}
    </div>
  );
}

// ── FilesPanel ────────────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  padding: 3,
  borderRadius: 3,
  cursor: "pointer",
  color: "var(--text-muted)",
  transition: "color 120ms",
};

function hoverHandlers() {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      (e.currentTarget as HTMLButtonElement).style.color =
        "var(--text-primary)";
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
    },
  };
}

export function FilesPanel() {
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const selectFile = useAppStore((s) => s.selectFile);
  const createFileNode = useAppStore((s) => s.createFileNode);
  const createFolderNode = useAppStore((s) => s.createFolderNode);
  const deleteNodes = useAppStore((s) => s.deleteNodes);
  const moveNodes = useAppStore((s) => s.moveNodes);
  const renameNode = useAppStore((s) => s.renameNode);
  const importFiles = useAppStore((s) => s.importFiles);
  const toggleWorkspace = useAppStore((s) => s.toggleWorkspace);
  const createWorkspaceNode = useAppStore((s) => s.createWorkspaceNode);
  const setWorkspaceMode = useAppStore((s) => s.setWorkspaceMode);

  const treeRef = useRef<TreeApi<FileTreeNode>>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [importMenu, setImportMenu] = useState<ImportMenuState | null>(null);
  const [workspaceMenu, setWorkspaceMenu] =
    useState<WorkspaceModeMenuState | null>(null);
  const workspaceMenuApi = useMemo<WorkspaceModeMenuApi>(
    () => ({
      state: workspaceMenu,
      open: (s) => setWorkspaceMenu(s),
      close: () => setWorkspaceMenu(null),
    }),
    [workspaceMenu],
  );

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Tracks parentId for context-menu-triggered imports
  const importParentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, []);

  const rowHeight = 26;
  const treeHeight = Math.max(rowHeight, countAllNodes(fileTree) * rowHeight);

  function handleNewFile(parentId?: string | null) {
    if (parentId === undefined) {
      treeRef.current?.create({ type: "leaf" });
    } else {
      treeRef.current?.create({ type: "leaf", parentId });
    }
  }

  function handleNewFolder(parentId?: string | null) {
    if (parentId === undefined) {
      treeRef.current?.create({ type: "internal" });
    } else {
      treeRef.current?.create({ type: "internal", parentId });
    }
  }

  function handleNewWorkspace(parentId?: string | null) {
    const id = createWorkspaceNode(parentId ?? null);
    // Trigger rename so the user can pick a name immediately
    setTimeout(() => treeRef.current?.edit(id), 50);
  }

  function handleDelete(id: string) {
    deleteNodes([id]);
  }

  const [status, setStatus] = useState<string | null>(null);

  // ── Import handlers ─────────────────────────────────────────────────────────

  function openFileImport(parentId: string | null) {
    importParentIdRef.current = parentId;
    fileInputRef.current?.click();
  }

  function openFolderImport(parentId: string | null) {
    importParentIdRef.current = parentId;
    folderInputRef.current?.click();
  }

  async function handleFilesInputChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    if (!e.target.files) return;
    setStatus("Importing…");
    try {
      const results = await readImportFiles(e.target.files, false);
      if (results.length > 0) importFiles(results, importParentIdRef.current);
    } finally {
      setStatus(null);
      e.target.value = "";
    }
  }

  async function handleFolderInputChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    if (!e.target.files) return;
    setStatus("Importing…");
    try {
      const results = await readImportFiles(e.target.files, true);
      if (results.length > 0) importFiles(results, importParentIdRef.current);
    } finally {
      setStatus(null);
      e.target.value = "";
    }
  }

  // ── Download handlers ────────────────────────────────────────────────────────

  async function handleDownloadProject() {
    const allPaths = getAllFilePaths(fileTree);
    if (allPaths.length === 0) return;

    // Collect contents on main thread (mopsaJs is synchronous, must stay here)
    const files = allPaths.flatMap(({ path }) => {
      try {
        return [{ path, content: readFile("/" + path) }];
      } catch {
        return [];
      }
    });

    setStatus("Compressing…");
    const worker = new Worker(
      new URL("../../workers/zip.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (ev: MessageEvent<{ buffer: ArrayBuffer }>) => {
      triggerDownload(
        new Blob([ev.data.buffer], { type: "application/zip" }),
        "project.zip",
      );
      worker.terminate();
      setStatus(null);
    };
    worker.onerror = () => {
      worker.terminate();
      setStatus(null);
    };
    worker.postMessage({ files });
  }

  function handleDownloadFile(nodeId: string) {
    const path = getNodePath(fileTree, nodeId);
    if (!path) return;
    const content = readFile("/" + path);
    const name = path.split("/").pop() ?? path;
    triggerDownload(new Blob([content], { type: "text/plain" }), name);
  }

  function handlePanelContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: null,
      isFolder: false,
    });
  }

  return (
    <WorkspaceModeMenuCtx.Provider value={workspaceMenuApi}>
    <SetContextMenuCtx.Provider value={setContextMenu}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".c,.h,.py,.u"
        style={{ display: "none" }}
        onChange={handleFilesInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleFolderInputChange}
      />

      <div
        style={{ display: "flex", flexDirection: "column", flex: 1 }}
        onContextMenu={handlePanelContextMenu}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px 4px",
            gap: 4,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Files
            {status && (
              <span
                style={{
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: 0,
                  fontStyle: "italic",
                  marginLeft: 6,
                }}
              >
                — {status}
              </span>
            )}
          </span>
          <button
            title="New file"
            onClick={() => handleNewFile()}
            style={iconBtnStyle}
            {...hoverHandlers()}
          >
            <FilePlus size={14} />
          </button>
          <button
            title="New folder"
            onClick={() => handleNewFolder()}
            style={iconBtnStyle}
            {...hoverHandlers()}
          >
            <FolderPlus size={14} />
          </button>
          <button
            title="New workspace"
            onClick={() => handleNewWorkspace()}
            style={iconBtnStyle}
            {...hoverHandlers()}
          >
            <Layers size={14} />
          </button>
          <button
            title="Import files or folder"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setImportMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            style={iconBtnStyle}
            {...hoverHandlers()}
          >
            <Upload size={14} />
          </button>
          <button
            title="Download project as ZIP"
            onClick={handleDownloadProject}
            style={iconBtnStyle}
            {...hoverHandlers()}
          >
            <Download size={14} />
          </button>
        </div>

        {/* Tree */}
        {fileTree.length === 0 ? (
          <div
            style={{
              padding: "8px 16px",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            No files
          </div>
        ) : (
          <Tree<FileTreeNode>
            ref={treeRef}
            data={fileTree}
            width="100%"
            height={treeHeight}
            rowHeight={rowHeight}
            indent={0}
            selection={activeFile ?? undefined}
            openByDefault={true}
            onSelect={(nodes) => {
              const leaf = nodes.find((n) => n.data.children === undefined);
              if (leaf) selectFile(leaf.id);
            }}
            onCreate={({ parentId, type }) => {
              const id =
                type === "leaf"
                  ? createFileNode(parentId ?? null)
                  : createFolderNode(parentId ?? null);
              return { id };
            }}
            onRename={({ id, name }) => {
              if (!renameNode(id, name)) {
                setStatus("Name already exists");
                setTimeout(() => setStatus(null), 2000);
              }
            }}
            onMove={({ dragIds, parentId }) => moveNodes(dragIds, parentId)}
            onDelete={({ ids }) => deleteNodes(ids)}
          >
            {FileRow}
          </Tree>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          treeRef={treeRef}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onNewWorkspace={handleNewWorkspace}
          onDelete={handleDelete}
          onImportFiles={(parentId) => {
            openFileImport(parentId);
            setContextMenu(null);
          }}
          onImportFolder={(parentId) => {
            openFolderImport(parentId);
            setContextMenu(null);
          }}
          onDownloadFile={handleDownloadFile}
          onToggleWorkspace={toggleWorkspace}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Import dropdown (header button) */}
      {importMenu && (
        <ImportMenu
          state={importMenu}
          onClose={() => setImportMenu(null)}
          onImportFiles={() => openFileImport(null)}
          onImportFolder={() => openFolderImport(null)}
        />
      )}

      {/* Workspace mode override menu (single instance, lifted) */}
      {workspaceMenu && (
        <WorkspaceModeMenu
          state={workspaceMenu}
          ignoreNodeId={workspaceMenu.nodeId}
          onPick={(m) => {
            setWorkspaceMode(workspaceMenu.nodeId, m);
            setWorkspaceMenu(null);
          }}
          onClose={() => setWorkspaceMenu(null)}
        />
      )}
    </SetContextMenuCtx.Provider>
    </WorkspaceModeMenuCtx.Provider>
  );
}
