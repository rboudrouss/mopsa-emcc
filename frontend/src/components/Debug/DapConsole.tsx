import { useEffect, useRef } from "react";
import { AnsiTerminal, type AnsiTerminalHandle } from "@/components/ui/AnsiTerminal";
import { useDebugStore } from "@/lib/store-debug";
import { Section } from "./CallStackView";

/** Renders DAP `output` events (alarms, messages) in a read-only terminal. */
export function DapConsole() {
  const consoleLines = useDebugStore((s) => s.consoleLines);
  const termRef = useRef<AnsiTerminalHandle>(null);
  const writtenRef = useRef(0);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (consoleLines.length < writtenRef.current) {
      // Console was cleared/reset.
      term.reset();
      writtenRef.current = 0;
    }
    for (let i = writtenRef.current; i < consoleLines.length; i++) {
      term.write(consoleLines[i].replace(/\n/g, "\r\n") + "\r\n");
    }
    writtenRef.current = consoleLines.length;
  }, [consoleLines]);

  return (
    <Section title="Console">
      <AnsiTerminal
        ref={termRef}
        readOnly
        style={{
          height: 140,
          padding: "6px 8px",
          background: "var(--bg-elevated)",
          borderRadius: 6,
        }}
      />
    </Section>
  );
}
