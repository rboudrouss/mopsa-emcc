import {
  BugIcon,
  ScanSearchIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";

type Engine = "automatic" | "interactive" | "dap";

// `-engine` is UI-only: it routes the whole right-hand interface between the
// batch results panel, the interactive REPL, and the DAP debugger. It's stored
// like any other option (optionValues["-engine"]) but surfaced here as a
// first-class mode switcher instead of a buried select in the options list.
const MODES: {
  value: Engine;
  label: string;
  Icon: LucideIcon;
  title: string;
}[] = [
  {
    value: "automatic",
    label: "Scan",
    Icon: ScanSearchIcon,
    title: "Run the analysis once and inspect the results panel",
  },
  {
    value: "interactive",
    label: "Interactive",
    Icon: TerminalIcon,
    title: "Drive a Mopsa REPL session",
  },
  {
    value: "dap",
    label: "Debug",
    Icon: BugIcon,
    title: "Step through the analysis with breakpoints (DAP)",
  },
];

export function EngineModePicker({ compact = false }: { compact?: boolean }) {
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as Engine) ?? "automatic",
  );
  const setOptionValue = useAppStore((s) => s.setOptionValue);

  return (
    <div
      role="radiogroup"
      aria-label="Analysis mode"
      title="Analysis mode (-engine)"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        // Recessed track so the active segment reads as a raised thumb.
        background: "var(--bg-base)",
        border: "1px solid var(--border)",
        borderRadius: 7,
        flexShrink: 0,
      }}
    >
      {MODES.map(({ value, label, Icon, title }) => {
        const active = engine === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (!active) setOptionValue("-engine", value);
            }}
            title={title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              border: "none",
              borderRadius: 5,
              cursor: active ? "default" : "pointer",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              whiteSpace: "nowrap",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.18)" : "none",
              transition: "background 150ms, color 150ms",
            }}
          >
            <Icon
              size={13}
              color={active ? "var(--color-accent)" : "currentColor"}
            />
            {(!compact || active) && label}
          </button>
        );
      })}
    </div>
  );
}
