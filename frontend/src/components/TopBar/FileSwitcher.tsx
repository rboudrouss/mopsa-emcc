import { useAppStore } from "@/lib/store";
import { getAllFilePaths } from "@/lib/tree";

/**
 * An embed's files (it has no Files panel): the current one, and the
 * others to switch to.
 */
export function FileSwitcher() {
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const selectFile = useAppStore((s) => s.selectFile);
  const files = getAllFilePaths(fileTree);
  const style: React.CSSProperties = {
    minWidth: 0,
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "var(--text-secondary)",
  };
  if (files.length <= 1)
    return <span style={style}>{files[0]?.path ?? ""}</span>;
  return (
    <select
      value={activeFile ?? ""}
      onChange={(e) => selectFile(e.target.value)}
      title="The file shown"
      aria-label="The file shown"
      style={{
        ...style,
        height: 28,
        padding: "0 6px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        cursor: "pointer",
        color: "var(--text-primary)",
      }}
    >
      {files.map((f) => (
        <option key={f.id} value={f.id}>
          {f.path}
        </option>
      ))}
    </select>
  );
}
