import { useAppStore } from "@/lib/store";
import { DomainsPanel } from "./DomainsPanel";
import { FilesPanel } from "./FilesPanel";
import { OptionsPanel } from "./OptionsPanel";

export function SecondarySidebar() {
  const activePanel = useAppStore((s) => s.activePanel);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        overflowY: "auto",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {activePanel === "files" && <FilesPanel />}
      {activePanel === "domains" && <DomainsPanel />}
      {activePanel === "options" && <OptionsPanel />}
    </div>
  );
}
