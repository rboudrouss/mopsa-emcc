/**
 * C arrays and structs inline in one piece, as their initializers:
 * t[0] = 1, t[1] = 2 → t = {1, 2}; s.a = 4, s.name[0] = 97 →
 * s = {.a = 4, .name = {97}}; cells apart → t = {[2] = 3}.
 */

interface Node {
  value?: string;
  children: Map<string, Node>;
}

/** "s.name[0]" → ["s", ".name", "[0]"], null for another shape ("*p",
 *  "p->x", "t[i]"). */
function path(name: string): string[] | null {
  const m = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*|\[\d+\])*)$/.exec(name);
  if (!m) return null;
  return [m[1], ...(m[2].match(/\.[A-Za-z_$][\w$]*|\[\d+\]/g) ?? [])];
}

/** `v` after `key` in an initializer: ".a = 4", ".a ≠ 0". */
const assign = (key: string, v: string) => `${key}${/^[≠∈∉]/.test(v) ? " " : " = "}${v}`;

function render(node: Node): string {
  if (node.children.size === 0) return node.value ?? "?";
  const keys = [...node.children.keys()];
  const indices = keys.map((k) => /^\[(\d+)\]$/.exec(k)?.[1]).map((i) => (i === undefined ? -1 : Number(i)));
  // an array from 0 without hole: its values in order
  if (indices.every((i) => i >= 0)) {
    const order = keys.map((k, j) => [k, indices[j]] as const).sort((a, b) => a[1] - b[1]);
    if (order.every(([, i], j) => i === j))
      return `{${order.map(([k]) => render(node.children.get(k)!)).join(", ")}}`;
    return `{${order.map(([k]) => assign(k, render(node.children.get(k)!))).join(", ")}}`;
  }
  return `{${keys.map((k) => assign(k, render(node.children.get(k)!))).join(", ")}}`;
}

/**
 * The variables `values` (name → text) with the cells of each array or
 * struct grouped under its name. A name with a value of its own and cells
 * names two variables (a local int s, a struct s of the caller): its cells
 * go.
 */
export function groupAggregates(values: Map<string, string>): Map<string, string> {
  const roots = new Map<string, Node>();
  const out = new Map<string, string>();
  for (const [name, v] of values) {
    const p = path(name);
    if (!p || p.length === 1) {
      out.set(name, v);
      continue;
    }
    let node: Node | undefined = roots.get(p[0]);
    if (!node) roots.set(p[0], (node = { children: new Map() }));
    for (const seg of p.slice(1)) {
      let next: Node | undefined = node.children.get(seg);
      if (!next) node.children.set(seg, (next = { children: new Map() }));
      node = next;
    }
    node.value = v;
  }
  for (const [base, node] of roots) if (!out.has(base)) out.set(base, render(node));
  return out;
}
