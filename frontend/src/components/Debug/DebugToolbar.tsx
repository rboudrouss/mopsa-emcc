import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import type { DebugControls } from "@/lib/hooks/use-debug-session";
import { useDebugStore } from "@/lib/store-debug";
import { useAppStore } from "@/lib/store";

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  cursor: "pointer",
  color: "var(--text-secondary)",
};

export function DebugToolbar({ controls }: { controls: DebugControls }) {
  const status = useDebugStore((s) => s.status);
  const requestSessionStart = useAppStore((s) => s.requestSessionStart);

  const stopped = status === "stopped";
  const busy = status === "running" || status === "initializing";
  const live = stopped || busy; // a session is currently running/paused
  const finished = status === "terminated" || status === "error";

  const Item = ({
    onClick,
    title,
    disabled,
    children,
  }: {
    onClick: () => void;
    title: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ ...btn, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {/* Play: resume when paused, otherwise (re)launch the analysis. */}
      <Item
        title={stopped ? "Continue" : "Start analysis"}
        onClick={stopped ? controls.cont : requestSessionStart}
        disabled={busy}
      >
        <Play size={15} />
      </Item>
      <Item title="Step over" onClick={controls.next} disabled={!stopped}>
        <ArrowRight size={15} />
      </Item>
      <Item title="Step into" onClick={controls.stepIn} disabled={!stopped}>
        <ArrowDown size={15} />
      </Item>
      <Item title="Step out" onClick={controls.stepOut} disabled={!stopped}>
        <ArrowUp size={15} />
      </Item>
      {/* Restart: relaunch from scratch (also the way to rerun once finished). */}
      <Item
        title="Restart analysis"
        onClick={requestSessionStart}
        disabled={!(stopped || finished)}
      >
        <RotateCcw size={14} />
      </Item>
      <Item title="Stop" onClick={controls.disconnect} disabled={!live}>
        <Square size={13} />
      </Item>
    </div>
  );
}
