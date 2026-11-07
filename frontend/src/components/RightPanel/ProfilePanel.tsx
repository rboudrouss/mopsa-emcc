import { useMemo, useState } from "react";
import { ChevronDownIcon, FlameIcon, LoaderCircleIcon } from "lucide-react";
import { computeAnalysisArgs } from "@/lib/analysis-args";
import { getBackend } from "@/lib/backend";

const MONO = "'JetBrains Mono', monospace";
const FLAME_FILE = "/tmp/mopsa-flamegraph.txt";
const MAX_DEPTH = 24;
const ROW = 18;

/**
 * Where the analysis spends its time: a profiled re-run of the current
 * analysis with Mopsa's function_profiler hook, its flame graph samples
 * ("main;f;g 1234", in µs) drawn as an icicle chart. WASM backend only (the
 * jsoo worker can't hand back the samples file).
 */

interface FlameNode {
  name: string;
  self: number;
  total: number;
  children: Map<string, FlameNode>;
}

function node(name: string): FlameNode {
  return { name, self: 0, total: 0, children: new Map() };
}

export function parseFolded(text: string): FlameNode {
  const root = node("all");
  for (const line of text.split("\n")) {
    const m = /^(.*) (\d+)$/.exec(line.trim());
    if (!m) continue;
    const us = parseInt(m[2], 10);
    if (!us) continue;
    let cur = root;
    cur.total += us;
    for (const name of m[1].split(";")) {
      let next = cur.children.get(name);
      if (!next) cur.children.set(name, (next = node(name)));
      next.total += us;
      cur = next;
    }
    cur.self += us;
  }
  return root;
}

function selfTimes(root: FlameNode): [string, number][] {
  const acc = new Map<string, number>();
  const visit = (n: FlameNode) => {
    if (n !== root) acc.set(n.name, (acc.get(n.name) ?? 0) + n.self);
    n.children.forEach(visit);
  };
  visit(root);
  return [...acc].sort((a, b) => b[1] - a[1]);
}

function fmt(us: number): string {
  return us >= 1e6 ? (us / 1e6).toFixed(2) + " s" : (us / 1e3).toFixed(1) + " ms";
}

function color(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = 20 + (Math.abs(h) % 35); // warm: orange → yellow
  return `hsl(${hue} 85% ${55 + (Math.abs(h >> 8) % 12)}%)`;
}

export function ProfilePanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; root: FlameNode }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [zoom, setZoom] = useState<string[]>([]);

  const run = async () => {
    const args = computeAnalysisArgs();
    if (!args) return;
    setState({ kind: "running" });
    setZoom([]);
    const { output, files } = await mopsaJs.query(
      [
        ...args,
        "-hook",
        "function_profiler",
        "-flamegraph",
        FLAME_FILE,
        "-flamegraph-resolution",
        "us",
      ],
      [FLAME_FILE],
    );
    const samples = files[FLAME_FILE];
    if (samples === undefined)
      setState({
        kind: "error",
        message: output.split("\n").find((l) => l.trim()) ?? "no samples",
      });
    else setState({ kind: "done", root: parseFolded(samples) });
  };

  if (getBackend() !== "wasm") return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button onClick={() => setOpen(!open)} style={headerButton}>
        <ChevronDownIcon
          size={12}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 120ms",
          }}
        />
        Profile
      </button>
      {open && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={run}
              disabled={state.kind === "running"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 5,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                cursor: state.kind === "running" ? "default" : "pointer",
              }}
            >
              {state.kind === "running" ? (
                <LoaderCircleIcon
                  size={12}
                  style={{ animation: "mopsa-spin 0.8s linear infinite" }}
                />
              ) : (
                <FlameIcon size={12} />
              )}
              {state.kind === "done" ? "Profile again" : "Profile this analysis"}
            </button>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Time spent per analyzed function
            </span>
          </div>
          {state.kind === "error" && (
            <span style={{ fontSize: 12, color: "#f87171" }}>{state.message}</span>
          )}
          {state.kind === "done" && (
            <FlameView root={state.root} zoom={zoom} setZoom={setZoom} />
          )}
        </>
      )}
    </div>
  );
}

function FlameView({
  root,
  zoom,
  setZoom,
}: {
  root: FlameNode;
  zoom: string[];
  setZoom: (z: string[]) => void;
}) {
  const focus = useMemo(() => {
    let n = root;
    for (const name of zoom) n = n.children.get(name) ?? n;
    return n;
  }, [root, zoom]);
  const top = useMemo(() => selfTimes(root).slice(0, 8), [root]);

  if (root.total === 0)
    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No samples.</span>;

  const rows: { n: FlameNode; path: string[]; x: number; w: number; depth: number }[] = [];
  const layout = (n: FlameNode, path: string[], x: number, w: number, depth: number) => {
    rows.push({ n, path, x, w, depth });
    if (depth >= MAX_DEPTH) return;
    let cx = x;
    for (const c of [...n.children.values()].sort((a, b) => b.total - a.total)) {
      const cw = (c.total / n.total) * w;
      if (cw < 0.002) continue;
      layout(c, [...path, c.name], cx, cw, depth + 1);
      cx += cw;
    }
  };
  layout(focus, zoom, 0, 1, 0);
  const depth = Math.max(...rows.map((r) => r.depth)) + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {zoom.length > 0 && (
        <button
          onClick={() => setZoom(zoom.slice(0, -1))}
          style={{ ...linkButton, alignSelf: "flex-start" }}
        >
          ← {["all", ...zoom].join(" › ")}
        </button>
      )}
      <div
        style={{
          position: "relative",
          height: depth * ROW,
          border: "1px solid var(--border)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {rows.map(({ n, path, x, w, depth }) => (
          <div
            key={path.join(";") || "root"}
            title={`${n.name}: ${fmt(n.total)} total, ${fmt(n.self)} self (${((n.total / root.total) * 100).toFixed(1)}%)`}
            onClick={() => n !== focus && setZoom(path)}
            style={{
              position: "absolute",
              left: `${x * 100}%`,
              width: `calc(${w * 100}% - 1px)`,
              top: depth * ROW,
              height: ROW - 1,
              background: depth === 0 ? "var(--bg-elevated)" : color(n.name),
              color: depth === 0 ? "var(--text-secondary)" : "#1a1206",
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: `${ROW - 1}px`,
              padding: "0 3px",
              boxSizing: "border-box",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              cursor: n !== focus ? "zoom-in" : "default",
            }}
          >
            {n.name} {fmt(n.total)}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Self time, total {fmt(root.total)}
        </span>
        {top.map(([name, us]) => (
          <div
            key={name}
            style={{
              display: "flex",
              fontFamily: MONO,
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </span>
            <span>{fmt(us)}</span>
            <span style={{ width: 52, textAlign: "right", color: "var(--text-muted)" }}>
              {((us / root.total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
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
};
