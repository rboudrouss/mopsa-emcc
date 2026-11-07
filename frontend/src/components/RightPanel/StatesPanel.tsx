import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
} from "lucide-react";
import {
  envEngine,
  type EnvContext,
  type EnvQueryResult,
  type EnvScope,
  type EnvironmentsBody,
} from "@/lib/envdb/env-engine";
import { useEnvEngine } from "@/lib/hooks/use-env-engine";
import { useEditorNav, revealInEditor } from "@/lib/editor-nav";
import { getCodeFilePath } from "@/lib/mopsa-client";
import { useAppStore } from "@/lib/store";

const MONO = "'JetBrains Mono', monospace";

const SCOPES: { value: EnvScope; label: string; title: string }[] = [
  { value: "line", label: "Line", title: "Variables occurring at this line" },
  {
    value: "function",
    label: "Function",
    title: "Every variable of the enclosing function",
  },
  {
    value: "all",
    label: "All",
    title: "Globals and the locals of every frame of the call stack",
  },
  {
    value: "state",
    label: "Domains",
    title: "The whole abstract state, as printed by each abstract domain",
  },
];

const OPEN_KEY = "mopsa-states-open";
const SCOPE_KEY = "mopsa-states-scope";

function readLocal<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* no localStorage */
  }
}

/**
 * Abstract states panel (Scan mode): the states Mopsa computed at the line
 * under the editor cursor, one per call stack, read from the environment
 * database of the background DAP session (see env-engine.ts).
 */
export function StatesPanel() {
  const [open, setOpen] = useState(() => readLocal(OPEN_KEY, "1") === "1");
  const [scope, setScope] = useState<EnvScope>(() =>
    readLocal<EnvScope>(SCOPE_KEY, "line"),
  );
  const cursorLine = useEditorNav((s) => s.cursorLine);
  // Re-render on file switch / edits: the file path lives outside React.
  const activeFile = useAppStore((s) => s.activeFile);
  const file = useMemo(() => getCodeFilePath(), [activeFile]); // eslint-disable-line react-hooks/exhaustive-deps
  const { phase, generation } = useEnvEngine();

  useEffect(() => {
    if (open) envEngine.start();
  }, [open]);

  const [result, setResult] = useState<{
    key: string;
    res: EnvQueryResult<EnvironmentsBody>;
  } | null>(null);
  const [lines, setLines] = useState<number[] | null>(null);

  const key = `${generation} ${file} ${cursorLine} ${scope}`;
  const settled = phase === "ready" || phase === "error";

  useEffect(() => {
    if (!open || !settled || cursorLine === null) return;
    let cancelled = false;
    void envEngine.getEnvironments(file, cursorLine, scope).then((res) => {
      if (!cancelled) setResult({ key, res });
    });
    return () => {
      cancelled = true;
    };
  }, [open, settled, key, file, cursorLine, scope]);

  useEffect(() => {
    if (!open || !settled) return;
    let cancelled = false;
    void envEngine.getLines(file).then((res) => {
      if (cancelled) return;
      if (res.kind !== "ok") return setLines(null);
      const entry = res.body.files[file];
      setLines(
        entry ? [...entry.reached, ...entry.unreachable].sort((a, b) => a - b) : [],
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, settled, generation, file]);

  const toggleOpen = () => {
    writeLocal(OPEN_KEY, open ? "0" : "1");
    setOpen(!open);
  };
  const pickScope = (s: EnvScope) => {
    writeLocal(SCOPE_KEY, s);
    setScope(s);
  };

  const prevLine =
    lines && cursorLine !== null
      ? [...lines].reverse().find((l) => l < cursorLine)
      : undefined;
  const nextLine =
    lines && cursorLine !== null ? lines.find((l) => l > cursorLine) : undefined;
  const fileName = file.split("/").pop() ?? file;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={toggleOpen} style={headerButton}>
          <ChevronDownIcon
            size={12}
            style={{
              transform: open ? "none" : "rotate(-90deg)",
              transition: "transform 120ms",
            }}
          />
          Abstract states
        </button>
        <div style={{ flex: 1 }} />
        {open && (
          <>
            <NavButton
              title={prevLine ? `Previous state: line ${prevLine}` : "No previous state"}
              disabled={prevLine === undefined}
              onClick={() => prevLine && revealInEditor(null, prevLine)}
            >
              <ChevronLeftIcon size={13} />
            </NavButton>
            <NavButton
              title={nextLine ? `Next state: line ${nextLine}` : "No next state"}
              disabled={nextLine === undefined}
              onClick={() => nextLine && revealInEditor(null, nextLine)}
            >
              <ChevronRightIcon size={13} />
            </NavButton>
          </>
        )}
      </div>

      {open && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {fileName}:{cursorLine ?? "–"}
            </span>
            <div style={{ flex: 1 }} />
            <ScopePicker scope={scope} onPick={pickScope} />
          </div>
          <StatesBody
            phase={phase}
            result={result?.key === key ? result.res : null}
            line={cursorLine}
            scope={scope}
          />
        </>
      )}
    </div>
  );
}

function StatesBody({
  phase,
  result,
  line,
  scope,
}: {
  phase: string;
  result: EnvQueryResult<EnvironmentsBody> | null;
  line: number | null;
  scope: EnvScope;
}) {
  if (line === null)
    return <Muted>Put the cursor on a line of the code to see its states.</Muted>;
  if (phase === "starting" || phase === "analyzing" || phase === "idle")
    return (
      <Muted>
        <LoaderCircleIcon
          size={12}
          style={{ animation: "mopsa-spin 0.8s linear infinite" }}
        />
        Computing abstract states…
      </Muted>
    );
  if (!result) return <Muted>Loading…</Muted>;
  if (result.kind === "analyzing") return <Muted>Computing abstract states…</Muted>;
  if (result.kind === "unavailable")
    return <Muted>Abstract states unavailable: {result.reason}</Muted>;

  const contexts = result.body.contexts;
  if (contexts.length === 0)
    return (
      <Muted>
        No state at line {line}: the analysis never reached it, or it holds no
        statement.
      </Muted>
    );
  if (contexts.every((c) => c.bottom))
    return (
      <Muted>
        Unreachable at line {line}: every state reaching it is ⊥.
      </Muted>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {contexts.length > 1 && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {contexts.length} call contexts
        </span>
      )}
      {contexts.map((c, i) => (
        <ContextCard key={i} ctx={c} openDepth={scope === "state" ? 1 : 2} />
      ))}
    </div>
  );
}

/** `openDepth`: tree levels expanded at first (the whole state of the
 *  domains is big: stdio stubs, heap cells…). */
function ContextCard({ ctx, openDepth }: { ctx: EnvContext; openDepth: number }) {
  // Mopsa lists the innermost call first; show the chain outermost first.
  const chain = [...ctx.callstack].reverse();
  const site = ctx.callstack[0]?.range.start;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-base)",
        overflow: "hidden",
      }}
    >
      {chain.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={chain.map((c) => c.function).join(" › ")}
          >
            {chain.map((c) => c.function).join(" › ")}
          </span>
          <div style={{ flex: 1 }} />
          {site && (
            <button
              onClick={() => revealInEditor(site.file, site.line)}
              title="Go to the call site"
              style={linkButton}
            >
              {(site.file.split("/").pop() ?? site.file) + ":" + site.line}
            </button>
          )}
        </div>
      )}
      <div style={{ padding: "6px 8px", overflowX: "auto" }}>
        {ctx.bottom ? (
          <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-muted)" }}>
            ⊥ (unreachable in this context)
          </span>
        ) : (
          <EnvTree value={ctx.env} openDepth={openDepth} />
        )}
      </div>
    </div>
  );
}

// ── Print-object tree ─────────────────────────────────────────────────────

// Mopsa may decorate names with their declaration site
// ("x:./example.c:5.9-14"); show the plain name unless it is ambiguous.
const DECORATION = /:[^\s:]+:\d+\.\d+(-\d+(\.\d+)?)?$/;

function shortKeys(keys: string[]): Map<string, string> {
  const short = new Map<string, string>();
  const count = new Map<string, number>();
  for (const k of keys) {
    const s = k.replace(DECORATION, "");
    short.set(k, s);
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  for (const k of keys) {
    const s = short.get(k)!;
    if ((count.get(s) ?? 0) > 1) short.set(k, k);
  }
  return short;
}

function isLeaf(v: unknown): boolean {
  return (
    v === null ||
    typeof v !== "object" ||
    (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"))
  );
}

function leafText(v: unknown): string {
  if (v === null || v === undefined) return "⊥";
  if (Array.isArray(v)) return "{" + v.map(leafText).join(", ") + "}";
  return String(v);
}

function EnvTree({ value, openDepth }: { value: unknown; openDepth: number }) {
  if (isLeaf(value))
    return (
      <span style={{ fontFamily: MONO, fontSize: 12 }}>{leafText(value)}</span>
    );
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);
  if (entries.length === 0)
    return (
      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-muted)" }}>
        (no variable)
      </span>
    );
  return <EnvEntries entries={entries} depth={0} openDepth={openDepth} />;
}

function EnvEntries({
  entries,
  depth,
  openDepth,
}: {
  entries: [string, unknown][];
  depth: number;
  openDepth: number;
}) {
  const names = shortKeys(entries.map(([k]) => k));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {entries.map(([k, v]) => (
        <EnvEntry
          key={k}
          name={names.get(k) ?? k}
          full={k}
          value={v}
          depth={depth}
          openDepth={openDepth}
        />
      ))}
    </div>
  );
}

function EnvEntry({
  name,
  full,
  value,
  depth,
  openDepth,
}: {
  name: string;
  full: string;
  value: unknown;
  depth: number;
  openDepth: number;
}) {
  const [open, setOpen] = useState(depth < openDepth);
  const row: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.6,
    paddingLeft: depth * 12,
    whiteSpace: "pre",
  };
  if (isLeaf(value))
    return (
      <div style={row} title={full}>
        <span style={{ color: "var(--text-secondary)" }}>{name}</span>
        <span style={{ color: "var(--text-muted)" }}> = </span>
        <span style={{ color: "var(--text-primary)" }}>{leafText(value)}</span>
      </div>
    );
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);
  return (
    <>
      <div
        style={{ ...row, cursor: "pointer", userSelect: "none" }}
        title={full}
        onClick={() => setOpen(!open)}
      >
        <span style={{ color: "var(--text-muted)", display: "inline-block", width: 12 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>{name}</span>
        {!open && (
          <span style={{ color: "var(--text-muted)" }}> ({entries.length})</span>
        )}
      </div>
      {open && (
        <EnvEntries entries={entries} depth={depth + 1} openDepth={openDepth} />
      )}
    </>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function ScopePicker({
  scope,
  onPick,
}: {
  scope: EnvScope;
  onPick: (s: EnvScope) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Variables shown"
      style={{
        display: "flex",
        gap: 1,
        padding: 1,
        background: "var(--bg-base)",
        border: "1px solid var(--border)",
        borderRadius: 5,
      }}
    >
      {SCOPES.map(({ value, label, title }) => {
        const active = value === scope;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            title={title}
            onClick={() => onPick(value)}
            style={{
              padding: "2px 7px",
              fontSize: 11,
              border: "none",
              borderRadius: 4,
              cursor: active ? "default" : "pointer",
              background: active ? "var(--bg-elevated)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: active ? 600 : 500,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function NavButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 20,
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 4,
        color: "var(--text-secondary)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-muted)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

const headerButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 11,
  color: "var(--color-accent)",
  flexShrink: 0,
};
