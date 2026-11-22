import { ExternalLinkIcon } from "lucide-react";
import { activePath, collectShared, shareUrl } from "@/lib/share";
import { useAppStore } from "@/lib/store";
import { getAllFilePaths, getWorkspaceForFile } from "@/lib/tree";

// The page with these files (the workspace of the current one), config and
// options, in a new tab, not embedded
async function openFull() {
  const s = useAppStore.getState();
  const active = activePath();
  const ws = s.activeFile ? getWorkspaceForFile(s.fileTree, s.activeFile) : null;
  const paths = ws
    ? getAllFilePaths(s.fileTree)
        .map((f) => f.path)
        .filter((p) => p.startsWith(`${ws}/`))
    : active
      ? [active]
      : [];
  window.open(await shareUrl(collectShared(paths, true)), "_blank", "noopener");
}

/** An embed's way out: these files in Mopsa, in a new tab. */
export function OpenFullButton({ compact }: { compact?: boolean }) {
  return (
    <button
      onClick={() => void openFull()}
      title="These files in Mopsa, in a new tab"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: compact ? "0 8px" : "0 10px",
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 6,
        cursor: "pointer",
        color: "var(--text-secondary)",
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      {compact ? "Mopsa" : "Open in Mopsa"} <ExternalLinkIcon size={13} />
    </button>
  );
}
