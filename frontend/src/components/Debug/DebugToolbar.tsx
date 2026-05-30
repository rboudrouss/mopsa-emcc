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
  const stopped = status === "stopped";
  const active = status === "stopped" || status === "running" || status === "initializing";

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
      <Item title="Continue" onClick={controls.cont} disabled={!stopped}>
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
      <Item title="Restart" onClick={controls.restart} disabled={!active}>
        <RotateCcw size={14} />
      </Item>
      <Item title="Stop" onClick={controls.disconnect} disabled={!active}>
        <Square size={13} />
      </Item>
    </div>
  );
}
