import { useState } from "react";

interface RawOutputProps {
  raw: string;
}

export function RawOutput({ raw }: RawOutputProps) {
  const [copied, setCopied] = useState(false);

  if (!raw) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <details style={{ display: "flex", flexDirection: "column" }}>
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
      <pre
        style={{
          marginTop: 8,
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
    </details>
  );
}
