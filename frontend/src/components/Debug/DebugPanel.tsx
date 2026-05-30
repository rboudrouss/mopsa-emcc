import { useDebugSession } from "@/lib/hooks/use-debug-session";
import { useDebugStore, type DebugStatus } from "@/lib/store-debug";
import { DebugToolbar } from "./DebugToolbar";
import { CallStackView } from "./CallStackView";
import { VariablesTree } from "./VariablesTree";
import { WatchPanel } from "./WatchPanel";
import { DapConsole } from "./DapConsole";
import { AlarmsView } from "./AlarmsView";

const STATUS_LABEL: Record<DebugStatus, string> = {
  idle: "press Run to start",
  initializing: "starting…",
  running: "running…",
  stopped: "paused",
  terminated: "terminated",
  error: "error",
};

/** DAP debugger panel for `-engine=dap`. */
export function DebugPanel() {
  const controls = useDebugSession();
  const status = useDebugStore((s) => s.status);
  const reason = useDebugStore((s) => s.stoppedReason);
  const errorMessage = useDebugStore((s) => s.errorMessage);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <DebugToolbar controls={controls} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {STATUS_LABEL[status]}
          {status === "stopped" && reason ? ` (${reason})` : ""}
        </span>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: "8px 10px",
            background: "rgba(248,113,113,.08)",
            border: "1px solid rgba(248,113,113,.3)",
            borderRadius: 6,
            fontSize: 12,
            color: "#f87171",
            fontFamily: "'JetBrains Mono', monospace",
            wordBreak: "break-word",
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        <AlarmsView />
        <CallStackView controls={controls} />
        <VariablesTree controls={controls} />
        <WatchPanel controls={controls} />
        <DapConsole />
      </div>
    </div>
  );
}
