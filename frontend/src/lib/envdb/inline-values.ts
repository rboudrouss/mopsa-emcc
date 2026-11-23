import { VALUE_DOMAINS } from "../domain-builder";
import type { InlineDomain } from "../editor-nav";

/**
 * The value of a variable split by the domains of the value product, for
 * the inline values: each domain can be shown or hidden (the eyes of the
 * Domains panel).
 *
 * Mopsa prints the values of a non-relational domain under the name of its
 * value domain, e.g. "float-itv ∪ (int-itv ∧ (congruences ∧ zero))": a
 * product is a pair, printed as a list [v1, v2] in JSON (nested for more
 * than two domains), and a union prints the value of one of its domains.
 * The name tells which part of the list is which domain.
 */

/** Mopsa's names of the value domains (`display`) → their eye. The integer
 *  intervals stand for the base value of a variable, what other domains
 *  print too (strings, pointers, Python types). */
const EYE: Record<string, InlineDomain> = {
  "int-itv": "intervals",
  "float-itv": "floats",
  ...Object.fromEntries(VALUE_DOMAINS.map((d) => [d.display, d.id])),
};

export type DomainTree =
  | { atom: string }
  | { pair: [DomainTree, DomainTree] }
  | { union: DomainTree[] };

/** The tree of a domain group's name, null when it names no value domain
 *  ("environment", "pointers"). */
export function parseDomainName(name: string): DomainTree | null {
  const tokens = name.match(/[()∧∪]|[^\s()∧∪]+/g) ?? [];
  let i = 0;
  const prim = (): DomainTree | null => {
    if (tokens[i] === "(") {
      i++;
      const t = union();
      if (tokens[i++] !== ")") return null;
      return t;
    }
    const tok = tokens[i];
    if (tok === undefined || /^[()∧∪]$/.test(tok)) return null;
    i++;
    return { atom: tok };
  };
  // a ∧ b ∧ c is a ∧ (b ∧ c), as Mopsa nests its pairs
  const prod = (): DomainTree | null => {
    const left = prim();
    if (!left || tokens[i] !== "∧") return left;
    i++;
    const right = prod();
    return right && { pair: [left, right] };
  };
  const union = (): DomainTree | null => {
    const first = prod();
    if (!first || tokens[i] !== "∪") return first;
    const branches = [first];
    while (tokens[i] === "∪") {
      i++;
      const b = prod();
      if (!b) return null;
      branches.push(b);
    }
    return { union: branches };
  };
  const tree = union();
  if (!tree || i !== tokens.length) return null;
  const known = (t: DomainTree): boolean =>
    "atom" in t ? t.atom in EYE : "pair" in t ? t.pair.some(known) : t.union.some(known);
  return known(tree) ? tree : null;
}

/** One domain's part of a value. */
export interface ValuePart {
  domain: InlineDomain;
  text: string;
}

function leafText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return `{${v.map(leafText).join(", ")}}`;
  return JSON.stringify(v);
}

const INT_ITV = /^(\[(-?\d+|-∞),(-?\d+|\+∞)\]|⊥|⊤)$/;

/** Whether `v` can be a value of the domain named `atom`: in a union, the
 *  branch of a value is the one it fits. */
function fits(atom: string, v: unknown): boolean {
  const str = typeof v === "string";
  switch (atom) {
    case "int-itv":
      return str && INT_ITV.test(v);
    case "float-itv":
      return str && /^(\[|⊥|⊤|NaN|[+-]∞)/.test(v);
    case "congruences":
      return str && /^(⊥|-?\d+|\d*ℤ(\+\d+)?)$/.test(v);
    case "zero":
      return str && /^(⊤|⊥|0|≠ 0)$/.test(v);
    case "excluded":
      return Array.isArray(v) || (str && /^[∈∉] /.test(v));
    case "powerset":
      return Array.isArray(v) || v === "⊤" || v === "⊥";
    case "bitmask":
      return str && /^[…01⊤]*$/.test(v);
    default:
      return true;
  }
}

const hasInt = (t: DomainTree): boolean =>
  "atom" in t ? t.atom === "int-itv" : "pair" in t ? t.pair.some(hasInt) : t.union.some(hasInt);

/** The branches of a union in the order to try for `v`: an integer
 *  interval goes to the integers, though a float can print as one. */
function branchesFor(branches: DomainTree[], v: unknown): DomainTree[] {
  if (!(typeof v === "string" && INT_ITV.test(v))) return branches;
  return [...branches.filter(hasInt), ...branches.filter((b) => !hasInt(b))];
}

/** The parts of value `v` printed by the domains of `tree`, null when `v`
 *  doesn't have its shape. */
export function valueParts(tree: DomainTree, v: unknown): ValuePart[] | null {
  if ("atom" in tree) {
    if (!fits(tree.atom, v)) return null;
    const domain = EYE[tree.atom] ?? "intervals";
    return [{ domain, text: leafText(v).replace(/\s+/g, " ").trim() }];
  }
  if ("pair" in tree) {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const a = valueParts(tree.pair[0], v[0]);
    const b = a && valueParts(tree.pair[1], v[1]);
    return b && [...a!, ...b];
  }
  for (const branch of branchesFor(tree.union, v)) {
    const parts = valueParts(branch, v);
    if (parts) return parts;
  }
  return null;
}

/**
 * The values `v` stands for: one, or several when Mopsa joined the values of
 * several partitions (branches kept apart) in one list, [a1, b1, a2, b2]
 * for (a ∧ b) twice, ["[1,1]", "[5,5]"] for an interval twice. Null when
 * `v` doesn't have the shape of `tree`.
 */
export function valueAlternatives(tree: DomainTree, v: unknown): ValuePart[][] | null {
  if ("union" in tree) {
    const first = Array.isArray(v) ? v[0] : v;
    for (const branch of branchesFor(tree.union, first)) {
      const alts = valueAlternatives(branch, v);
      if (alts) return alts;
    }
    return null;
  }
  const one = valueParts(tree, v);
  if (one) return [one];
  if (!Array.isArray(v) || v.length < 2) return null;
  const width = "pair" in tree ? 2 : 1;
  if (v.length % width !== 0) return null;
  const out: ValuePart[][] = [];
  for (let i = 0; i < v.length; i += width) {
    const parts = valueParts(tree, width === 2 ? [v[i], v[i + 1]] : v[i]);
    if (!parts) return null;
    out.push(parts);
  }
  return out;
}

// ── Text ─────────────────────────────────────────────────────────────────

type Bound = bigint | null;

/** The integer bounds of an interval, null for an infinite one; undefined
 *  for no integer interval (floats, ⊥). */
function intBounds(text: string | undefined): [Bound, Bound] | undefined {
  const m = text && /^\[(-?\d+|-∞),(-?\d+|\+∞)\]$/.exec(text);
  if (!m) return undefined;
  return [m[1] === "-∞" ? null : BigInt(m[1]), m[2] === "+∞" ? null : BigInt(m[2])];
}

const inside = (n: bigint, [lo, hi]: [Bound, Bound]) =>
  (lo === null || n >= lo) && (hi === null || n <= hi);

/** The constants of "{1, 2}", "∈ {1, 2}", "∉ {1, 2}". */
function constants(text: string): bigint[] | null {
  const m = /^(?:[∈∉] )?\{(.*)\}$/.exec(text);
  if (!m) return null;
  const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return items.every((s) => /^-?\d+$/.test(s)) ? items.map(BigInt) : null;
}

const sameSet = (a: bigint[], b: bigint[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Whether `values` are all the integers of the interval, which says it. */
const fills = (values: bigint[], b: [Bound, Bound] | undefined) =>
  !!b &&
  b[0] !== null &&
  b[1] !== null &&
  BigInt(new Set(values).size) === b[1] - b[0] + 1n &&
  values.every((n) => inside(n, b));

const LIMITS: Record<string, string> = {
  "1.7976931348623157e+308": "DBL_MAX",
  "3.4028234663852886e+38": "FLT_MAX",
};

/** A bound written short: the shortest decimal of the same double
 *  (0.10000000000000001: 0.1), 4 digits with an exponent, DBL_MAX. */
function shortNumber(n: string): string {
  const sign = n.startsWith("-") ? "-" : "";
  const abs = sign ? n.slice(1) : n;
  if (LIMITS[abs]) return sign + LIMITS[abs];
  const x = Number(n);
  if (!Number.isFinite(x)) return n;
  const t = String(x);
  return t.includes("e") ? x.toPrecision(4).replace(/\.?0+e/, "e") : t;
}

/** An interval written short: "4" for [4,4], "⊤" for any float. */
export function intervalText(text: string): string {
  const short = text.replace(/-?\d+(\.\d+)?(e[+-]?\d+)?/g, shortNumber);
  if (/^\[-(DBL|FLT)_MAX,(DBL|FLT)_MAX\]∨\+∞∨-∞∨NaN$/.test(short)) return "⊤";
  const single = /^\[([^,\]]+),\1\]$/.exec(short);
  return single ? single[1] : short;
}

/**
 * The text of a value, the parts of the shown domains only, joined by ∧.
 * The parts that say nothing are left out: ⊤ (congruence ℤ, no excluded
 * value...), and when the interval shows, what it says already (the
 * congruence 2 of [2,2], ≠ 0 of [3,5], ∈ {0, 1, 2} of [0,2], an excluded
 * value outside it). An empty text: nothing to show.
 */
export function partsText(parts: ValuePart[], shown: (d: InlineDomain) => boolean): string {
  const itvText = parts.find((p) => p.domain === "intervals")?.text;
  const bounds = intBounds(itvText);
  const itvShown = shown("intervals") && itvText !== undefined;
  const single = bounds && bounds[0] !== null && bounds[0] === bounds[1] ? bounds[0] : null;
  // The constant shown by the interval [5,5], or by the congruence 5 (no
  // interval, or hidden): the other parts can't say more
  const congr = parts.find((p) => p.domain === "congruences" && shown("congruences"))?.text;
  const constant =
    itvShown && single !== null
      ? single
      : congr && /^-?\d+$/.test(congr)
        ? BigInt(congr)
        : null;
  const setPart = parts.find((p) => p.domain === "sets" && shown("sets"));
  const setValues = setPart && constants(setPart.text);

  const out: string[] = [];
  for (const { domain, text } of parts) {
    if (!shown(domain)) continue;
    const t = partText(domain, text);
    if (t) out.push(t);
  }
  return out.join(" ∧ ");

  function partText(domain: InlineDomain, text: string): string | null {
    switch (domain) {
      case "intervals":
      case "floats":
        return intervalText(text);
      case "congruences":
        if (text === "ℤ") return null;
        return itvShown && single !== null && text === String(single) ? null : text;
      case "zero": {
        if (text === "⊤") return null;
        if (itvShown && bounds && text === "≠ 0" && !inside(0n, bounds)) return null;
        if (constant !== null && text === (constant === 0n ? "0" : "≠ 0")) return null;
        // ≠ 0 of {3, 5}, of 2ℤ+1
        if (text === "≠ 0" && setValues && !setValues.includes(0n)) return null;
        const m = congr && /^(\d*)ℤ\+(\d+)$/.exec(congr);
        if (text === "≠ 0" && m && BigInt(m[2]) % BigInt(m[1] || "1") !== 0n) return null;
        return text;
      }
      case "sets":
        if (text === "⊤") return null;
        if (itvShown && setValues && fills(setValues, bounds)) return null;
        return constant !== null && setValues && sameSet(setValues, [constant]) ? null : text;
      case "excluded": {
        if (text === "∉ ∅") return null;
        const values = constants(text);
        if (!values) return text;
        if (text.startsWith("∉")) {
          // the values excluded outside the interval are no news
          const kept = bounds ? values.filter((n) => inside(n, bounds)) : values;
          return kept.length ? `∉ {${kept.join(", ")}}` : null;
        }
        if (text.startsWith("∈")) {
          if (setValues && sameSet(values, setValues)) return null;
          if (itvShown && fills(values, bounds)) return null;
          if (constant !== null && sameSet(values, [constant])) return null;
        }
        return text;
      }
      case "bitmask":
        // Mopsa prints the bits from the highest unknown one: none for a
        // constant, "…⊤" when all are unknown
        if (text === "") return single !== null && constant === null ? `0b${single.toString(2)}` : null;
        if (/^…?⊤+$/.test(text)) return null;
        return /^[01⊤]/.test(text) ? `0b${text}` : text;
      default:
        return text;
    }
  }
}
