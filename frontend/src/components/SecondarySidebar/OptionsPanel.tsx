import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import {
  DEFAULT_OPTION_VALUES,
  OPTIONS_SCHEMA,
  type OptionSpec,
} from "@/lib/options-schema";
import { clearState } from "@/lib/persistence";
import { cancelPendingSave, useAppStore } from "@/lib/store";

export function OptionsPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "10px 16px 8px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Options
      </div>

      {/* Reset */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => {
            if (
              window.confirm(
                "Reset Mopsa to its default state? This will clear all saved files, configs and options.",
              )
            ) {
              cancelPendingSave();
              clearState();
              window.location.reload();
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            padding: "6px 10px",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 12,
            justifyContent: "center",
          }}
        >
          <RotateCcwIcon size={12} />
          Reset to defaults
        </button>
      </div>

      {OPTIONS_SCHEMA.map((group) => (
        <OptionsGroup
          key={group.group}
          group={group.group}
          options={group.options}
        />
      ))}
    </div>
  );
}

function OptionsGroup({
  group,
  options,
}: {
  group: string;
  options: OptionSpec[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {open ? (
          <ChevronDownIcon size={12} color="var(--text-muted)" />
        ) : (
          <ChevronRightIcon size={12} color="var(--text-muted)" />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          {group}
        </span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {options.map((opt) => (
            <OptionRow key={opt.flag} spec={opt} />
          ))}
        </div>
      )}
    </div>
  );
}

function OptionRow({ spec }: { spec: OptionSpec }) {
  const value = useAppStore((s) => s.optionValues[spec.flag]);
  const setOptionValue = useAppStore((s) => s.setOptionValue);
  const resetOption = useAppStore((s) => s.resetOption);

  const isModified = value !== DEFAULT_OPTION_VALUES[spec.flag];

  return (
    <div
      style={{
        padding: "8px 12px 8px 16px",
        borderLeft: isModified
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: isModified ? "rgba(245,181,68,.03)" : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-primary)",
              fontWeight: 500,
            }}
          >
            {spec.label}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {spec.hint}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isModified && (
            <button
              onClick={() => resetOption(spec.flag)}
              title="Reset to default"
              style={{
                display: "flex",
                alignItems: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "var(--text-muted)",
                borderRadius: 3,
              }}
            >
              <XIcon size={12} />
            </button>
          )}
          <OptionInput
            spec={spec}
            value={value}
            onChange={(v) => setOptionValue(spec.flag, v)}
          />
        </div>
      </div>
    </div>
  );
}

function OptionInput({
  spec,
  value,
  onChange,
}: {
  spec: OptionSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (spec.type === "bool" || spec.type === "boolArg") {
    const checked = Boolean(value);
    return (
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: checked ? "var(--color-accent)" : "var(--bg-elevated)",
          border: `1px solid ${checked ? "var(--color-accent)" : "var(--border)"}`,
          cursor: "pointer",
          position: "relative",
          transition: "background 150ms, border-color 150ms",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: checked ? "#0f1117" : "var(--text-muted)",
            transition: "left 150ms",
          }}
        />
      </button>
    );
  }

  if (spec.type === "int") {
    return (
      <input
        type="number"
        value={Number(value)}
        min={spec.min}
        max={spec.max}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{
          width: 56,
          padding: "2px 6px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-primary)",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />
    );
  }

  if (spec.type === "select") {
    return (
      <select
        value={String(value ?? spec.default)}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "2px 6px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text-primary)",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: "pointer",
        }}
      >
        {spec.choices?.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  // text
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: spec.flag === "__raw" ? 120 : 80,
        padding: "2px 6px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        color: "var(--text-primary)",
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    />
  );
}
