import { useEffect, useRef } from "react";
import { AnsiTerminal, type AnsiTerminalHandle } from "@/components/ui/AnsiTerminal";

interface OutputTerminalProps {
  raw: string;
}

/**
 * Full-pane, always-open ANSI terminal used when `-format=text`. The text
 * output is meant to be read as-is (mopsa emits colored SGR sequences), so we
 * skip the results panel entirely and surface the raw terminal output directly.
 */
export function OutputTerminal({ raw }: OutputTerminalProps) {
  const termRef = useRef<AnsiTerminalHandle>(null);

  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.reset();
    if (raw) t.write(raw);
    t.fit();
  }, [raw]);

  return (
    <AnsiTerminal
      ref={termRef}
      readOnly
      style={{
        flex: 1,
        minHeight: 0,
        padding: "8px 10px",
        background: "var(--bg-elevated)",
        borderRadius: 6,
      }}
    />
  );
}
