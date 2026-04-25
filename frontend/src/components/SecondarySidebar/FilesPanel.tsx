import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist';
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
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { countAllNodes } from '@/lib/tree';
import type { FileTreeNode, SupportedLanguage } from '@/lib/types';

// ── Language chip ─────────────────────────────────────────────────────────────

const LANG_CHIP: Record<SupportedLanguage, { bg: string; color: string; label: string }> = {
  c:         { bg: 'rgba(96,165,250,.15)',  color: '#60a5fa', label: 'C' },
  python:    { bg: 'rgba(251,191,36,.15)',  color: '#fbbf24', label: 'PY' },
  universal: { bg: 'rgba(167,139,250,.15)', color: '#a78bfa', label: 'UNI' },
};

function getFileLang(filename: string): SupportedLanguage {
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.uni')) return 'universal';
  return 'c';
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

// ── Node renderer ─────────────────────────────────────────────────────────────

function FileRow({ node, style, dragHandle }: NodeRendererProps<FileTreeNode>) {
  const checks = useAppStore((s) => s.checks);
  const setContextMenu = useContext(SetContextMenuCtx);
  const isFolder = node.data.children !== undefined;

  const warnings = !isFolder
    ? checks.filter(
        (c) =>
          (c.range.start.file.endsWith(node.data.name) ||
            c.range.start.file.endsWith('/' + node.data.name)) &&
          (c.kind === 'warning' || c.kind === 'error'),
      ).length
    : 0;

  const lang = !isFolder ? getFileLang(node.data.name) : null;
  const chip = lang ? LANG_CHIP[lang] : null;

  if (node.isEditing) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
        <input
          autoFocus
          defaultValue={node.data.name}
          style={{
            flex: 1,
            background: 'var(--bg-base)',
            border: '1px solid var(--color-accent)',
            borderRadius: 3,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            padding: '1px 4px',
            outline: 'none',
          }}
          onBlur={(e) => node.submit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') node.submit(e.currentTarget.value);
            if (e.key === 'Escape') node.reset();
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
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        paddingRight: 12,
        paddingLeft: node.level * 12 + 6,
        cursor: 'pointer',
        background: node.isSelected ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 120ms',
        userSelect: 'none',
      }}
      onClick={() => {
        if (isFolder) node.toggle();
        else node.select();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, isFolder });
      }}
      onMouseEnter={(e) => {
        if (!node.isSelected)
          (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (!node.isSelected)
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Chevron */}
      {isFolder ? (
        <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text-muted)' }}>
          {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}

      {/* Icon */}
      <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text-muted)' }}>
        {isFolder
          ? node.isOpen ? <FolderOpen size={14} /> : <Folder size={14} />
          : <File size={14} />}
      </span>

      {/* Lang chip */}
      {chip && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 3,
            background: chip.bg,
            color: chip.color,
            flexShrink: 0,
            letterSpacing: '0.03em',
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
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {node.data.name}
      </span>

      {/* Warning badge */}
      {warnings > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#f5b544', flexShrink: 0 }}>
          ⚠{warnings}
        </span>
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
  onDelete: (id: string) => void;
  onClose: () => void;
}

function ContextMenu({ state, treeRef, onNewFile, onNewFolder, onDelete, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const menuWidth = 180;
  const menuHeight = 140;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 4);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 4);

  // The "parent" for new nodes: if right-clicked on a folder, use it; else use its parent
  const newParentId = state.nodeId && state.isFolder ? state.nodeId : (
    state.nodeId ? treeRef.current?.get(state.nodeId)?.parent?.id ?? null : null
  );

  function item(
    icon: React.ReactNode,
    label: string,
    action: () => void,
    danger = false,
  ) {
    return (
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          color: danger ? '#f87171' : 'var(--text-primary)',
          textAlign: 'left',
          borderRadius: 4,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'none';
        }}
        onClick={() => { action(); onClose(); }}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        width: menuWidth,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        padding: 4,
        zIndex: 1000,
      }}
    >
      {item(<FilePlus size={13} />, 'New File', () => onNewFile(newParentId))}
      {item(<FolderPlus size={13} />, 'New Folder', () => onNewFolder(newParentId))}

      {state.nodeId && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {item(
            <Pencil size={13} />,
            'Rename',
            () => {
              if (state.nodeId) treeRef.current?.edit(state.nodeId);
            },
          )}
          {item(
            <Trash2 size={13} />,
            'Delete',
            () => { if (state.nodeId) onDelete(state.nodeId); },
            true,
          )}
        </>
      )}
    </div>
  );
}

// ── FilesPanel ────────────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  padding: 3,
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--text-muted)',
  transition: 'color 120ms',
};

export function FilesPanel() {
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const selectFile = useAppStore((s) => s.selectFile);
  const createFileNode = useAppStore((s) => s.createFileNode);
  const createFolderNode = useAppStore((s) => s.createFolderNode);
  const deleteNodes = useAppStore((s) => s.deleteNodes);
  const moveNodes = useAppStore((s) => s.moveNodes);
  const renameNode = useAppStore((s) => s.renameNode);

  const treeRef = useRef<TreeApi<FileTreeNode>>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const rowHeight = 26;
  const treeHeight = Math.max(rowHeight, countAllNodes(fileTree) * rowHeight);

  function getSelectedFolderId(): string | null {
    const selected = treeRef.current?.selectedNodes[0];
    if (!selected) return null;
    if (selected.data.children !== undefined) return selected.id;
    return selected.parent?.id ?? null;
  }

  // parentId === undefined → let react-arborist pick based on focused node (toolbar buttons)
  // parentId === null | string → explicit parent (context menu)
  function handleNewFile(parentId?: string | null) {
    if (parentId === undefined) {
      treeRef.current?.create({ type: 'leaf' });
    } else {
      treeRef.current?.create({ type: 'leaf', parentId });
    }
  }

  function handleNewFolder(parentId?: string | null) {
    if (parentId === undefined) {
      treeRef.current?.create({ type: 'internal' });
    } else {
      treeRef.current?.create({ type: 'internal', parentId });
    }
  }

  function handleDelete(id: string) {
    deleteNodes([id]);
  }

  // Close context menu on right-click on empty space
  function handlePanelContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null, isFolder: false });
  }

  return (
    <SetContextMenuCtx.Provider value={setContextMenu}>
      <div
        style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
        onContextMenu={handlePanelContextMenu}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px 4px', gap: 4 }}>
          <span
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Files
          </span>
          <button
            title="New file"
            onClick={() => handleNewFile()}
            style={iconBtnStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
          >
            <FilePlus size={14} />
          </button>
          <button
            title="New folder"
            onClick={() => handleNewFolder()}
            style={iconBtnStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)')}
          >
            <FolderPlus size={14} />
          </button>
        </div>

        {/* Tree */}
        {fileTree.length === 0 ? (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
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
              const id = type === 'leaf'
                ? createFileNode(parentId ?? null)
                : createFolderNode(parentId ?? null);
              return { id };
            }}
            onRename={({ id, name }) => renameNode(id, name)}
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
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </SetContextMenuCtx.Provider>
  );
}
