/**
 * The constraints of a relational domain made readable.
 *
 * Mopsa prints them as Apron gives them: an octagon, closed, lists every
 * bound of every sum and difference of two variables, each bound apart
 * ("j ≥ n", "n ≥ j", "n + j ≤ 20", "n + j ≥ 20", ...). Here:
 *   - the constraints the others imply are left out: the bounds of a sum or
 *     a difference given by the bounds of its variables (n + j ≤ 20 from
 *     n ≤ 10 and j ≤ 10), or by two other constraints (i ≤ k from i ≤ j and
 *     j ≤ k);
 *   - the two bounds of an expression make one constraint: "j = n",
 *     "n + j = 20", "a - 1 ≤ j ≤ a + 4".
 * Constraints with other numbers than integers (rationals, intervals) stay
 * as printed, and take no part.
 */

type Vec = Map<string, bigint>;

/** A half-space: vec · x ≤ bound. */
interface Half {
  vec: Vec;
  bound: bigint;
}

const OP = / (≤|≥|=) /;

function parseSide(side: string, vec: Vec, sign: bigint): bigint | null {
  let cst = 0n;
  if (side === "0") return 0n;
  for (const term of side.split(" + ")) {
    if (/^-?\d+$/.test(term)) {
      cst += BigInt(term);
      continue;
    }
    const m = /^(\d*)([^\s\d\-/.[;].*)$/.exec(term);
    if (!m || /\s/.test(m[2])) return null;
    const coef = m[1] ? BigInt(m[1]) : 1n;
    vec.set(m[2], (vec.get(m[2]) ?? 0n) + sign * coef);
  }
  return cst;
}

/** "lhs op rhs" as half-spaces (two for an equality), null when not a
 *  linear constraint with integers. */
function parse(c: string): Half[] | null {
  const parts = c.split(OP);
  if (parts.length !== 3) return null;
  const [lhs, op, rhs] = parts;
  const vec: Vec = new Map();
  const l = parseSide(lhs, vec, 1n);
  const r = parseSide(rhs, vec, -1n);
  if (l === null || r === null) return null;
  for (const [k, v] of vec) if (v === 0n) vec.delete(k);
  if (vec.size === 0) return null;
  // lhs - rhs (op) 0, i.e. vec (op) r - l
  const b = r - l;
  if (op === "≤") return [{ vec, bound: b }];
  if (op === "≥") return [{ vec: neg(vec), bound: -b }];
  return [
    { vec, bound: b },
    { vec: neg(vec), bound: -b },
  ];
}

const keyOf = (v: Vec) =>
  [...v]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, x]) => `${x}*${k}`)
    .join(" ");

function sub(a: Vec, b: Vec): Vec {
  const out = new Map(a);
  for (const [k, x] of b) {
    const y = (out.get(k) ?? 0n) - x;
    if (y === 0n) out.delete(k);
    else out.set(k, y);
  }
  return out;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function readable(constraints: string[]): string[] {
  // the tightest bound of each vector
  const halves = new Map<string, Half>();
  // each half as written (lhs - rhs of its constraint), to write it back so
  const written = new Map<string, Vec>();
  // the constraints in order: the raw ones, and the expressions (each one
  // with its opposite) as first written
  const order: ({ raw: string } | { dir: Vec })[] = [];
  const seen = new Set<string>();
  for (const c of constraints) {
    const hs = parse(c);
    if (!hs) {
      order.push({ raw: c });
      continue;
    }
    const op = c.split(OP)[1];
    const dir = op === "≥" ? neg(hs[0].vec) : hs[0].vec;
    for (const h of hs) {
      const k = keyOf(h.vec);
      const prev = halves.get(k);
      if (!prev || h.bound < prev.bound) halves.set(k, h);
      if (!written.has(k)) written.set(k, dir);
    }
    const k = keyOf(dir);
    if (!seen.has(k)) {
      seen.add(k).add(keyOf(neg(dir)));
      order.push({ dir });
    }
  }

  // Bounds of the variables
  const upper = (x: string) => halves.get(keyOf(new Map([[x, 1n]])))?.bound;
  const lower = (x: string) => {
    const b = halves.get(keyOf(new Map([[x, -1n]])))?.bound;
    return b === undefined ? undefined : -b;
  };
  const byBounds = (h: Half): boolean => {
    let max = 0n;
    for (const [x, a] of h.vec) {
      const b = a > 0n ? upper(x) : lower(x);
      if (b === undefined) return false;
      max += a * b;
    }
    return max <= h.bound;
  };
  const byTwo = (k: string, h: Half): boolean => {
    for (const [k1, h1] of halves) {
      if (k1 === k) continue;
      const k2 = keyOf(sub(h.vec, h1.vec));
      if (k2 === k || k2 === "") continue;
      const h2 = halves.get(k2);
      if (h2 && h1.bound + h2.bound <= h.bound) return true;
    }
    return false;
  };
  // The most complex ones go first, the simplest and the first written
  // stay. Each one goes when the ones left imply it, so the ones left imply
  // all of them.
  const weight = (h: Half) => [...h.vec.values()].reduce((s, x) => s + abs(x), 0n);
  const candidates = [...halves]
    .filter(([, h]) => h.vec.size >= 2)
    .reverse()
    .sort(([, a], [, b]) => b.vec.size - a.vec.size || Number(weight(b) - weight(a)));
  for (const [k, h] of candidates) if (byBounds(h) || byTwo(k, h)) halves.delete(k);

  const out: string[] = [];
  for (const item of order) {
    if ("raw" in item) {
      out.push(item.raw);
      continue;
    }
    const kHi = keyOf(item.dir);
    const kLo = keyOf(neg(item.dir));
    const hi = halves.get(kHi);
    const lo = halves.get(kLo);
    if (hi && lo) out.push(write(item.dir, -lo.bound, hi.bound));
    // one bound left: written as its constraint was
    else if (hi) out.push(writeHalf(written.get(kHi)!, hi));
    else if (lo) out.push(writeHalf(written.get(kLo)!, lo));
  }
  return out;
}

const neg = (v: Vec): Vec => new Map([...v].map(([k, x]) => [k, -x]));

/** Half-space h, written along dir (h.vec or its opposite). */
function writeHalf(dir: Vec, h: Half): string {
  return keyOf(dir) === keyOf(h.vec)
    ? write(dir, undefined, h.bound)
    : write(dir, -h.bound, undefined);
}

/** lo ≤ dir · x ≤ hi, the positive terms on the left. */
function write(dir: Vec, lo: bigint | undefined, hi: bigint | undefined): string {
  const pos = [...dir].filter(([, a]) => a > 0n);
  const neg = [...dir].filter(([, a]) => a < 0n);
  // no positive term: written the other way round
  if (pos.length === 0)
    return write(
      new Map([...dir].map(([k, a]) => [k, -a])),
      hi === undefined ? undefined : -hi,
      lo === undefined ? undefined : -lo,
    );
  const terms = (ts: [string, bigint][]) =>
    ts.map(([x, a]) => (abs(a) === 1n ? x : `${abs(a)}${x}`)).join(" + ");
  const P = terms(pos);
  const side = (c: bigint) =>
    neg.length === 0
      ? String(c)
      : c === 0n
        ? terms(neg)
        : `${terms(neg)} ${c > 0n ? "+" : "-"} ${abs(c)}`;
  if (lo !== undefined && hi !== undefined)
    return lo === hi ? `${P} = ${side(hi)}` : `${side(lo)} ≤ ${P} ≤ ${side(hi)}`;
  return hi !== undefined ? `${P} ≤ ${side(hi)}` : `${P} ≥ ${side(lo!)}`;
}

// The same states come back on many lines
const cache = new Map<string, string[]>();

export function readableRelations(constraints: Iterable<string>): string[] {
  const list = [...constraints];
  const key = list.join("\n");
  let out = cache.get(key);
  if (!out) {
    out = readable(list);
    if (cache.size > 500) cache.clear();
    cache.set(key, out);
  }
  return out;
}
