import { useEffect, useRef, useState } from "react";
import { AnsiTerminal, type AnsiTerminalHandle } from "@/components/ui/AnsiTerminal";

interface RawOutputProps {
  raw: string;
}

export function RawOutput({ raw }: RawOutputProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const termRef = useRef<AnsiTerminalHandle>(null);

  // Write into the terminal only while it's mounted (i.e. the <details> is
  // open). xterm throws if written to while its container is 0×0 (collapsed),
  // so we mount it lazily on open.
  useEffect(() => {
    if (!open) return;
    const t = termRef.current;
    if (!t) return;
    t.reset();
    if (raw) t.write(raw);
    t.fit();
  }, [open, raw]);

  if (!raw) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <details
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{ display: "flex", flexDirection: "column" }}
    >
      <summary
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: "pointer",
          userSelect: "none",
          padding: "4px 0",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▶</span>
        Raw Output
        <button
          onClick={handleCopy}
          title="Copy raw output"
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: copied ? "var(--text-accent, #4ade80)" : "var(--text-muted)",
            fontSize: 11,
            padding: "0 4px",
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </summary>
      {open && (
        <AnsiTerminal
          ref={termRef}
          readOnly
          style={{
            marginTop: 8,
            padding: "8px 10px",
            background: "var(--bg-elevated)",
            borderRadius: 6,
            height: 280,
          }}
        />
      )}
    </details>
  );
}
