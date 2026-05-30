import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  DEFAULT_OPTION_VALUES,
  OPTIONS_SCHEMA,
  type OptionSpec,
} from "@/lib/options-schema";
import { clearState } from "@/lib/persistence";
import { cancelPendingSave, useAppStore } from "@/lib/store";

/** Strip dashes and lowercase so dash-heavy flags match dash-free queries. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/-/g, "");
}

/** Split a query into dash-free, lowercased tokens. */
function searchTokens(query: string): string[] {
  return query.toLowerCase().replace(/-/g, "").split(/\s+/).filter(Boolean);
}

/**
 * Rank an option against the search tokens. Lower number = higher priority;
 * `null` means no match. A match on the flag or label outranks a match that
 * only appears in the description (hint).
 */
function matchRank(spec: OptionSpec, tokens: string[]): number | null {
  if (tokens.length === 0) return 0;
  const flag = normalize(spec.flag);
  const label = normalize(spec.label);
  const hint = normalize(spec.hint);
  const everyIn = (hay: string) => tokens.every((t) => hay.includes(t));

  const inFlag = everyIn(flag);
  const inLabel = everyIn(label);
  if (inFlag && inLabel) return 0;
  if (inFlag) return 1;
  if (inLabel) return 2;
  if (everyIn(hint)) return 3;
  // Tokens scattered across flag + label + hint.
  if (everyIn(`${flag} ${label} ${hint}`)) return 4;
  return null;
}

export function OptionsPanel() {
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => searchTokens(query), [query]);

  const results = useMemo(() => {
    if (tokens.length === 0) return null;
    return OPTIONS_SCHEMA.flatMap((g) =>
      g.options.map((opt) => ({
        spec: opt,
        group: g.group,
        rank: matchRank(opt, tokens),
      })),
    )
      .filter(
        (r): r is { spec: OptionSpec; group: string; rank: number } =>
          r.rank !== null,
      )
      .sort((a, b) => a.rank - b.rank);
  }, [tokens]);

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

      {/* Search */}
      <div style={{ padding: "0 12px 10px" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <SearchIcon
            size={12}
            color="var(--text-muted)"
            style={{ position: "absolute", left: 8, pointerEvents: "none" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search options…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "5px 24px 5px 26px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Clear search"
              style={{
                position: "absolute",
                right: 4,
                display: "flex",
                alignItems: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "var(--text-muted)",
              }}
            >
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {results === null ? (
        <>
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
        </>
      ) : results.length === 0 ? (
        <div
          style={{
            padding: 16,
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          No options match “{query.trim()}”
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {results.map((r) => (
            <OptionRow key={r.spec.flag} spec={r.spec} group={r.group} />
          ))}
        </div>
      )}
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
  const modifiedCount = useAppStore(
    (s) =>
      options.filter(
        (opt) => s.optionValues[opt.flag] !== DEFAULT_OPTION_VALUES[opt.flag],
      ).length,
  );

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
            color: modifiedCount > 0 ? "var(--color-accent)" : "var(--text-secondary)",
          }}
        >
          {group}
        </span>
        {modifiedCount > 0 && (
          <span
            title={`${modifiedCount} option${modifiedCount > 1 ? "s" : ""} modifiée${modifiedCount > 1 ? "s" : ""}`}
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontWeight: 600,
              lineHeight: 1,
              color: "var(--color-accent)",
              background: "rgba(245,181,68,.12)",
              border: "1px solid var(--color-accent)",
              borderRadius: 8,
              padding: "2px 6px",
            }}
          >
            {modifiedCount}
          </span>
        )}
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

function OptionRow({ spec, group }: { spec: OptionSpec; group?: string }) {
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
      {group && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {group}
        </span>
      )}
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
          {group && spec.flag !== "__raw" && (
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
                opacity: 0.7,
              }}
            >
              {spec.flag}
            </span>
          )}
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
