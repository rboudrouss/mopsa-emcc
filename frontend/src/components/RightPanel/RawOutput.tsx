import { useState } from "react";
import { FoldHeader } from "./Fold";

interface RawOutputProps {
  raw: string;
}

export function RawOutput({ raw }: RawOutputProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!raw) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <FoldHeader
        title="Raw output"
        open={open}
        onToggle={() => setOpen(!open)}
        alwaysShowActions
        actions={
          <button
            onClick={handleCopy}
            title="Copy raw output"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied
                ? "var(--text-accent, #4ade80)"
                : "var(--text-muted)",
              fontSize: 11,
              padding: "0 4px",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        }
      />
      {open && (
        <pre
          style={{
            padding: "10px 12px",
            background: "var(--bg-elevated)",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.6,
            overflowX: "auto",
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {raw}
        </pre>
      )}
    </div>
  );
}
