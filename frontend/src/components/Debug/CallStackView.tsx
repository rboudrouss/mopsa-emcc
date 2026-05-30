import type { DebugControls } from "@/lib/hooks/use-debug-session";
import { useDebugStore } from "@/lib/store-debug";

export function CallStackView({ controls }: { controls: DebugControls }) {
  const callStack = useDebugStore((s) => s.callStack);
  const currentFrameId = useDebugStore((s) => s.currentFrameId);

  if (callStack.length === 0) return null;

  return (
    <Section title="Call stack">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {callStack.map((f) => (
          <button
            key={f.id}
            onClick={() => controls.selectFrame(f.id)}
            style={{
              textAlign: "left",
              background:
                f.id === currentFrameId ? "var(--bg-hover)" : "transparent",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              padding: "3px 6px",
              color: "var(--text-secondary)",
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{f.name}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {f.source?.name ?? ""}:{f.line}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
