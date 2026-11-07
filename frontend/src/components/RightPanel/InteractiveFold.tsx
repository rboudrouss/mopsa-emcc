import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { InteractiveTerminal } from "./InteractiveTerminal";

/**
 * "Interactive mode" fold of the results: a Mopsa REPL (-engine=interactive)
 * on the current code, started when the fold is first opened. The terminal
 * stays mounted when folded, so its session survives.
 */
export function InteractiveFold() {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const toggle = () => {
    if (!open && nonce === 0) setNonce(1);
    setOpen(!open);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
      <button
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
        title="Step through the analysis in Mopsa's interactive engine"
      >
        <ChevronDownIcon
          size={12}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 120ms",
          }}
        />
        Interactive mode
      </button>
      {nonce > 0 && (
        <div style={{ height: 380, display: open ? "flex" : "none", flexDirection: "column" }}>
          <InteractiveTerminal
            startNonce={nonce}
            onRestart={() => setNonce((n) => n + 1)}
          />
        </div>
      )}
    </div>
  );
}
