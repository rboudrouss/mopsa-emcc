import { useState } from "react";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { FoldHeader } from "./Fold";

/**
 * "Interactive terminal" fold of the results: a Mopsa REPL (-engine=interactive)
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
      <FoldHeader
        title="Interactive terminal"
        open={open}
        onToggle={toggle}
        hint="Step through the analysis in Mopsa's interactive engine"
      />
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
