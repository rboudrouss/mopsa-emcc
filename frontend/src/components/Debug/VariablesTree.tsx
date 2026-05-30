import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DebugControls } from "@/lib/hooks/use-debug-session";
import { useDebugStore } from "@/lib/store-debug";
import type { DapVariable } from "@/lib/dap/types";
import { Section } from "./CallStackView";

export function VariablesTree({ controls }: { controls: DebugControls }) {
  const scopes = useDebugStore((s) => s.scopes);

  if (scopes.length === 0) return null;

  return (
    <Section title="Variables">
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {scopes.map((scope) => (
          <VarNode
            key={scope.variablesReference}
            name={scope.name}
            value=""
            variablesReference={scope.variablesReference}
            controls={controls}
            depth={0}
            defaultOpen
          />
        ))}
      </div>
    </Section>
  );
}

function VarNode({
  name,
  value,
  variablesReference,
  controls,
  depth,
  defaultOpen = false,
}: {
  name: string;
  value: string;
  variablesReference: number;
  controls: DebugControls;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const children = useDebugStore((s) => s.variables[variablesReference]);
  const expandable = variablesReference > 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && expandable && children === undefined) {
      void controls.loadVariables(variablesReference);
    }
  };

  return (
    <div>
      <div
        onClick={expandable ? toggle : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: depth * 12,
          fontSize: 12,
          cursor: expandable ? "pointer" : "default",
          lineHeight: "18px",
        }}
      >
        <span style={{ width: 12, display: "inline-flex", color: "var(--text-muted)" }}>
          {expandable ? (
            open ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : null}
        </span>
        <span style={{ color: "var(--text-primary)" }}>{name}</span>
        {value !== "" && (
          <span style={{ color: "var(--text-secondary)" }}>: {value}</span>
        )}
      </div>
      {open &&
        expandable &&
        (children ?? []).map((c: DapVariable, i) => (
          <VarNode
            key={`${c.name}-${i}`}
            name={c.name}
            value={c.value}
            variablesReference={c.variablesReference}
            controls={controls}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
