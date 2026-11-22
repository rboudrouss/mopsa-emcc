// The Domains panel's choices (value domains, relations, C memory, branch
// partitioning) and the Mopsa config they make: the language's default
// preset with its numeric part rewritten. Every language shares Mopsa's
// numeric domains, so Python and Universal get them too, without a preset of
// their own.
import { parseConfigText } from "./mopsa-client";

export type DomainKind = "c" | "python" | "universal" | "multilanguage";

export type ValueDomain =
  "congruences" | "zero" | "excluded" | "sets" | "bitmask";
export type Relations = "none" | "packed" | "all";
export type MemoryDomain = "strings" | "sentinels" | "rewriting";

export interface DomainChoice {
  values: ValueDomain[];
  relations: Relations;
  memory: MemoryDomain[];
  branches: boolean;
}

export const NO_CHOICE: DomainChoice = {
  values: [],
  relations: "none",
  memory: [],
  branches: false,
};

interface Item<T> {
  id: T;
  label: string;
  title: string;
}

const ITV = "universal.numeric.values.intervals.integer";
const RELATIONAL = "universal.numeric.relational";
const TAIL = "universal.partitioning.tail-markers";

export const VALUE_DOMAINS: (Item<ValueDomain> & {
  module: string;
  reduction?: string;
})[] = [
  {
    id: "congruences",
    label: "Congruences",
    title: "x mod n, e.g. that a counter stays even",
    module: "universal.numeric.values.congruences",
    reduction: "universal.numeric.reductions.intervals_congruences",
  },
  {
    id: "zero",
    label: "Zero / non-zero",
    title: "Whether a value is zero, e.g. before a division",
    module: "universal.numeric.values.zero",
  },
  {
    id: "excluded",
    label: "Excluded values",
    title: "Constants a value cannot be, e.g. x ≠ 0",
    module: "universal.numeric.values.powersets.excluded",
    reduction: "universal.numeric.reductions.intervals_excluded_powerset",
  },
  {
    id: "sets",
    label: "Value sets",
    title: "Small sets of constants, e.g. x ∈ {1, 3}",
    module: "universal.numeric.values.powersets.standard",
    reduction: "universal.numeric.reductions.intervals_powerset",
  },
  {
    id: "bitmask",
    label: "Bitmasks",
    title: "Known bits, for bitwise operations",
    module: "universal.numeric.values.bitmask",
  },
];

export const MEMORY_DOMAINS: (Item<MemoryDomain> & { module: string })[] = [
  {
    id: "strings",
    label: "String lengths",
    title: "Position of the first '\\0' of each array",
    module: "c.memory.lowlevel.string_length",
  },
  {
    id: "sentinels",
    label: "Pointer sentinels",
    title: "Position of the first NULL of pointer arrays (with string lengths)",
    module: "c.memory.lowlevel.pointer_sentinel",
  },
  {
    id: "rewriting",
    label: "Symbolic rewriting",
    title: "Rewrites expressions to evaluate them more precisely",
    module: "c.memory.symbolic.rewriting",
  },
];

// The packing of each language: Universal has none.
const PACKING: Record<DomainKind, string | null> = {
  c: "c.memory.packing.static_scope",
  multilanguage: "c.memory.packing.static_scope",
  python: "python.packing.static_scope",
  universal: null,
};

// Left out in the browser: with C+Python, bitmasks lose the alarms (the
// analysis ends early) and relations between all variables exhaust the stack.
const UNAVAILABLE: Partial<Record<DomainKind, string[]>> = {
  multilanguage: ["bitmask", "all"],
};

export function valueOptions(kind: DomainKind) {
  return VALUE_DOMAINS.filter((d) => !UNAVAILABLE[kind]?.includes(d.id));
}

export function relationOptions(
  kind: DomainKind,
): (Item<Relations> & { hint?: string })[] {
  const options: (Item<Relations> & { hint?: string })[] = [
    { id: "none", label: "None", title: "Each variable on its own" },
    {
      id: "packed",
      label: "Within each function",
      title: "Linear relations between the variables of a function",
    },
    {
      id: "all",
      label: "Between all variables",
      ...(kind === "c"
        ? {
            title:
              "Linear relations between all variables, those of the C library headers too: analyzing them takes minutes",
            hint: "very slow",
          }
        : { title: "Linear relations between all variables" }),
    },
  ];
  return options.filter(
    (o) =>
      !(o.id === "packed" && !PACKING[kind]) &&
      !UNAVAILABLE[kind]?.includes(o.id),
  );
}

/** The preset a kind starts from. */
export function basePreset(kind: DomainKind): {
  lang: "c" | "python" | "universal";
  file: string;
} {
  if (kind === "multilanguage")
    return { lang: "python", file: "multilanguage.json" };
  return { lang: kind, file: "default.json" };
}

// ── Choice ↔ preset name ─────────────────────────────────────────────────────
// A config of the panel is recorded (state, share links) as a preset name,
// e.g. "domains:c:congruences,packed,branches". No choice is the base preset.

const PREFIX = "domains:";

export function choicePreset(kind: DomainKind, c: DomainChoice): string {
  const parts = [
    ...c.values,
    ...(c.relations === "none" ? [] : [c.relations]),
    ...(kind === "c" ? c.memory : []),
    ...(c.branches ? ["branches"] : []),
  ];
  return parts.length
    ? `${PREFIX}${kind}:${parts.join(",")}`
    : basePreset(kind).file;
}

export function parseChoicePreset(
  name: string,
): { kind: DomainKind; choice: DomainChoice } | null {
  if (!name.startsWith(PREFIX)) return null;
  const [kind, list = ""] = name.slice(PREFIX.length).split(":");
  if (!["c", "python", "universal", "multilanguage"].includes(kind))
    return null;
  const parts = list.split(",").filter(Boolean);
  const values = VALUE_DOMAINS.map((d) => d.id).filter((id) =>
    parts.includes(id),
  );
  const memory = MEMORY_DOMAINS.map((d) => d.id).filter((id) =>
    parts.includes(id),
  );
  const relations: Relations = parts.includes("all")
    ? "all"
    : parts.includes("packed")
      ? "packed"
      : "none";
  return {
    kind: kind as DomainKind,
    choice: { values, relations, memory, branches: parts.includes("branches") },
  };
}

/** The text of a preset: a file of share.json or a choice of the panel. */
export function presetText(
  configs: Record<string, Record<string, string | undefined>>,
  lang: string,
  name: string,
): string | undefined {
  const parsed = parseChoicePreset(name);
  if (!parsed) return configs[lang]?.[name];
  const base = basePreset(parsed.kind);
  const text = configs[base.lang]?.[base.file];
  return text && buildConfigText(text, parsed.kind, parsed.choice);
}

/** "Intervals, congruences, packed relations, branches". */
export function choiceLabel(c: DomainChoice): string {
  return [
    "Intervals",
    ...VALUE_DOMAINS.filter((d) => c.values.includes(d.id)).map((d) =>
      d.label.toLowerCase(),
    ),
    ...(c.relations === "packed" ? ["relations per function"] : []),
    ...(c.relations === "all" ? ["relations"] : []),
    ...MEMORY_DOMAINS.filter((d) => c.memory.includes(d.id)).map((d) =>
      d.label.toLowerCase(),
    ),
    ...(c.branches ? ["branches apart"] : []),
  ].join(", ");
}

/** The name of a preset in the results: what it has, for a choice. */
export function presetLabel(name: string): string {
  const parsed = parseChoicePreset(name);
  if (parsed) return choiceLabel(parsed.choice);
  if (name === "default.json" || name === "multilanguage.json")
    return "Intervals";
  return name.replace(/\.json$/, "");
}

// ── Reading a config ─────────────────────────────────────────────────────────

/** The choices a config has, whatever wrote it. */
export function readChoice(config: unknown): DomainChoice {
  const s = JSON.stringify(config ?? "");
  return {
    values: VALUE_DOMAINS.filter((d) => s.includes(`"${d.module}"`)).map(
      (d) => d.id,
    ),
    relations: s.includes(`"${RELATIONAL}"`)
      ? /packing\.static_scope/.test(s)
        ? "packed"
        : "all"
      : "none",
    memory: MEMORY_DOMAINS.filter((d) => s.includes(`"${d.module}"`)).map(
      (d) => d.id,
    ),
    branches: s.includes(`"${TAIL}"`),
  };
}

// ── Writing a config ─────────────────────────────────────────────────────────

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Replaces the first node `match` accepts (depth first) by `f` of it. */
function replaceFirst(
  node: Json,
  match: (n: Json) => boolean,
  f: (n: Json) => Json,
): [Json, boolean] {
  if (match(node)) return [f(node), true];
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const [n, done] = replaceFirst(node[i], match, f);
      if (done) return [node.map((x, j) => (j === i ? n : x)), true];
    }
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const [n, done] = replaceFirst(node[k], match, f);
      if (done) return [{ ...node, [k]: n }, true];
    }
  }
  return [node, false];
}

const isObj = (n: Json): n is { [k: string]: Json } =>
  !!n && typeof n === "object" && !Array.isArray(n);

// A compose under a partitioning must be written as nested apply/on.
function uncompose(d: Json): Json {
  if (!isObj(d) || !Array.isArray(d.compose)) return d;
  const [first, ...rest] = d.compose;
  if (rest.length === 0) return first;
  return { apply: first, on: uncompose({ compose: rest }) };
}

export function buildConfig(
  base: Json,
  kind: DomainKind,
  c: DomainChoice,
): Json {
  if (!isObj(base)) return base;
  let domain = base.domain;

  const values = VALUE_DOMAINS.filter((d) => c.values.includes(d.id));
  if (values.length > 0) {
    const reductions = values.flatMap((d) =>
      d.reduction ? [d.reduction] : [],
    );
    [domain] = replaceFirst(
      domain,
      (n) => n === ITV,
      () => ({
        product: [ITV, ...values.map((d) => d.module)],
        ...(reductions.length ? { reductions } : {}),
      }),
    );
  }

  const packing = PACKING[kind];
  if (c.relations === "all" || (c.relations === "packed" && packing)) {
    const packed = c.relations === "packed" && packing;
    [domain] = replaceFirst(
      domain,
      (n) => isObj(n) && "nonrel" in n,
      (nonrel) => ({
        product: [
          nonrel,
          packed ? { apply: packing, on: RELATIONAL } : RELATIONAL,
        ],
        reductions: [
          packed
            ? `reductions.${packing}`
            : "universal.numeric.reductions.intervals_rel",
        ],
      }),
    );
  }

  if (kind === "c") {
    const strings = c.memory.includes("strings");
    if (strings)
      [domain] = replaceFirst(
        domain,
        (n) => n === "c.memory.lowlevel.cells",
        (cells) => ({
          product: [
            cells,
            "c.memory.lowlevel.string_length",
            ...(c.memory.includes("sentinels")
              ? ["c.memory.lowlevel.pointer_sentinel"]
              : []),
          ],
          reductions: [
            "universal.numeric.reductions.numeric_eval",
            "c.memory.reductions.pointer_eval",
          ],
        }),
      );
    if (c.memory.includes("rewriting"))
      [domain] = replaceFirst(
        domain,
        (n) =>
          Array.isArray(n) && n.includes("c.memory.scalars.machine_numbers"),
        (list) =>
          (list as Json[]).flatMap((x) =>
            x === "c.memory.scalars.machine_numbers"
              ? ["c.memory.symbolic.rewriting", x]
              : [x],
          ),
      );
  }

  if (c.branches) domain = { apply: TAIL, on: uncompose(domain) };

  return { ...base, domain };
}

export function buildConfigText(
  baseText: string,
  kind: DomainKind,
  c: DomainChoice,
): string {
  const parsed = parseConfigText(baseText) as Json | null;
  if (parsed === null || choicePreset(kind, c) === basePreset(kind).file)
    return baseText;
  return JSON.stringify(buildConfig(parsed, kind, c), null, 2) + "\n";
}
