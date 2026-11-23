import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import {
  envEngine,
  type EnvQueryResult,
  type EnvironmentsBody,
} from "../envdb/env-engine";
import { useEnvEngine } from "./use-env-engine";
import {
  useEditorNav,
  VALUE_EYES,
  type InlineDomain,
  type InlineValuesMode,
} from "../editor-nav";
import {
  parseDomainName,
  partsText,
  valueAlternatives,
  type DomainTree,
} from "../envdb/inline-values";
import { groupAggregates } from "../envdb/aggregates";
import { pointerText } from "../envdb/pointers";
import { readableRelations } from "../envdb/relations";
import { useAppStore } from "../store";

/**
 * Editor overlays fed by the environment database of the background
 * analysis (see env-engine.ts):
 *   - coverage: a gutter bar on the lines the analysis reached, and a grey
 *     background on the lines it found unreachable (every state is ⊥);
 *   - inline values: after the code of a line, the abstract values of its
 *     variables and the relations between them (with a relational domain),
 *     of the domains whose eye is open in the Domains panel: what the line
 *     brings (cursor line only, or every line), or on every line the state
 *     before it or after it.
 */

const MAX_INLINE = 70;
const VAR_LIKE = /^[A-Za-z_$][\w$]*(\[[^\]]*\]|\.[\w$]+|->[\w$]+)*$/;
const DECORATION = /:[^\s:]+:\d+\.\d+(-\d+(\.\d+)?)?$/;
// Python heap addresses of callables, classes and modules (C ones too, of
// C extensions): noise inline.
const PY_HIDDEN =
  /^@(function|builtin_function_or_method|method|classmethod|staticmethod|module|type|c)\b/;

/**
 * One value as shown inline. Python variables point to heap addresses
 * ("@Inst{int}:w", "@list"): shown as their type, and hidden (null) for
 * functions, classes and modules.
 */
function valueText(v: unknown): string | null {
  if (v === null || v === undefined) return "⊥";
  const s = (typeof v === "object" ? JSON.stringify(v) : String(v))
    .replace(/\s+/g, " ")
    .trim();
  if (!s.startsWith("@")) return s;
  if (PY_HIDDEN.test(s)) return null;
  const inst = /^@Inst\{([^}]*)\}/.exec(s);
  if (inst) return inst[1];
  return /^@([A-Za-z_][\w.]*)/.exec(s)?.[1] ?? s;
}

/** One variable as shown inline: "a = [0,10]" or, a Python variable with
 *  only a type, "values: list". */
interface InlinePart {
  name: string;
  value: string;
  isType: boolean;
}

/** Every domain shown. */
const ALL = () => true;

/** The variables of a line-scope print object, with the domains `shown`
 *  only. A variable printed by several domains (Python: its type in the
 *  environment, its value in the numeric domain) is shown once, by value
 *  when there is one. The values of other domains than the numeric ones
 *  and the pointers (types, strings) go with the intervals. `file`, the
 *  file shown: the heap blocks allocated there go without it. */
export function inlineParts(
  env: unknown,
  python = false,
  shown: (d: InlineDomain) => boolean = ALL,
  file?: string,
): InlinePart[] {
  if (env === null || env === undefined) return [];
  // Each partition (branches kept apart) is a state of its own: a variable
  // is the one value or the other, "x = 1 ∨ 5", a pointer to the bases of
  // both
  const states = partitions(env).map((e) => stateParts(e, python, shown, file));
  const names = [...new Set(states.flatMap((st) => [...st.keys()]))];
  return names.map((name) => {
    const per = states.flatMap((st) => (st.has(name) ? [st.get(name)!] : []));
    const ptr = per.every((p) => p.pointer) && per.map((p) => p.pointer!);
    if (ptr && ptr.every((q) => q.offset === ptr[0].offset)) {
      const bases = [...new Set(ptr.flatMap((q) => q.bases))];
      return { name, value: pointerText(bases, ptr[0].offset, file), isType: false };
    }
    const typed = per.every((p) => p.isType);
    const values = [...new Set(per.filter((p) => p.isType === typed).map((p) => p.value))];
    return { name, value: values.join(typed ? " | " : " ∨ "), isType: typed };
  });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A key of a state that is no partition: a domain group. */
const isGroup = (k: string) =>
  parseDomainName(k) !== null || /^(numeric-relations|pointers|environment)/.test(k);

/** The states of the partitions of a print object (branches kept apart):
 *  under keys that are no domain groups ("ε", "if (x > 0)",
 *  "return@main.c:8.2-10"), each holding domain groups, beside the groups of
 *  the state where no partition applies. */
function partitions(env: unknown): unknown[] {
  if (!isObject(env)) return [env];
  const subs = Object.entries(env);
  const isPartition = ([k, v]: [string, unknown]) =>
    !isGroup(k) && isObject(v) && Object.keys(v).some(isGroup);
  const parts = subs.filter(isPartition);
  if (parts.length === 0) return [env];
  const rest = subs.filter((e) => !isPartition(e));
  return [
    ...(rest.length > 0 ? [Object.fromEntries(rest)] : []),
    ...parts.flatMap(([, v]) => partitions(v)),
  ];
}

/** A variable of one state; a C pointer keeps its bases and offset, to
 *  join them across partitions. */
interface StatePart extends InlinePart {
  pointer?: { bases: string[]; offset?: string };
}

/** The variables of one state. */
function stateParts(
  env: unknown,
  python: boolean,
  shown: (d: InlineDomain) => boolean,
  file?: string,
): Map<string, StatePart> {
  // C pointers: their bases, and their offsets, numeric variables offset⦃p⦄
  const pointers = new Map<string, string[]>();
  const offsets = new Map<string, string>();
  const vars = new Map<string, { types: Set<string>; values: string[] }>();
  const entry = (name: string) => {
    let e = vars.get(name);
    if (!e) vars.set(name, (e = { types: new Set(), values: [] }));
    return e;
  };
  const leaf = (key: string, v: unknown, tree: DomainTree | null, group: string) => {
    if (!key || key.startsWith("@")) return; // heap addresses' internals
    if (group === "pointers") {
      // ∅: no base yet (before its declaration)
      const bases = (Array.isArray(v) ? v : [v]).map(String).filter((b) => b !== "∅");
      if (shown("pointers") && bases.length > 0) pointers.set(key, bases);
      return;
    }
    const alts = tree && valueAlternatives(tree, v);
    const offset = /^offset⦃(.+)⦄$/.exec(key);
    if (offset) {
      const itvs = alts?.map((parts) => parts.find((p) => p.domain === "intervals")?.text);
      offsets.set(offset[1], itvs?.length === 1 && itvs[0] ? itvs[0] : String(v));
      return;
    }
    if (alts) {
      const texts = [...new Set(alts.map((parts) => partsText(parts, shown)))];
      // (one alternative saying nothing: the variable says nothing)
      if (!texts.includes("")) entry(key).values.push(texts.join(" ∨ "));
      return;
    }
    if (!shown("intervals")) return;
    const list = Array.isArray(v) ? v : [v];
    const texts = list.map((x) => valueText(x));
    if (texts.some((x) => x === null)) return; // a callable, class, module
    const isType = list.every((x) => String(x).startsWith("@"));
    const text = [...new Set(texts as string[])].join(isType ? " | " : ", ");
    if (isType) entry(key).types.add(text);
    else entry(key).values.push(Array.isArray(v) ? `{${text}}` : text);
  };
  const visit = (
    key: string,
    v: unknown,
    depth: number,
    tree: DomainTree | null,
    group: string,
  ) => {
    if (isObject(v))
      for (const [k, sub] of Object.entries(v))
        // The top-level keys are domain groups ("float-itv ∪ int-itv",
        // "environment"): they aren't part of the names, and tell the
        // domains of the values.
        visit(
          depth > 1 && VAR_LIKE.test(key) ? `${key}.${k}` : k.replace(DECORATION, ""),
          sub,
          depth + 1,
          depth === 0 ? parseDomainName(k) : tree,
          depth === 0 ? k : group,
        );
    else leaf(key, v, tree, group);
  };
  visit("", env, 0, null, "");

  const out = new Map<string, StatePart>();
  const values = new Map<string, string>();
  for (const [name, { types, values: vs }] of vars) {
    const type = [...types].join(" | ");
    // a class or a builtin named by its name ("str: str"): no news
    if (vs.length === 0 && type === name) continue;
    // a string of any value says less than its type
    if (vs.length === 0 || (type && vs.every((x) => x === "⊤")))
      out.set(name, { name, value: type, isType: true });
    else values.set(name, [...new Set(vs)].join(" ∧ "));
  }
  for (const [name, bases] of pointers) values.set(name, pointerText(bases, offsets.get(name), file));
  // C arrays and structs in one piece (Python objects keep their type)
  for (const [name, value] of python ? values : groupAggregates(values)) {
    const bases = pointers.get(name);
    out.set(name, {
      name,
      value,
      isType: false,
      ...(bases ? { pointer: { bases, offset: offsets.get(name) } } : {}),
    });
  }
  return out;
}

/**
 * The text shown at the end of a line: the state after it, then what
 * changes in the state before the next line, each variable once. A variable whose value differs
 * between the two (entering a branch or a loop) shows both, "i = 0 → [0,9]".
 */
export function mergedInlineText(after: InlinePart[], before: InlinePart[]): string {
  const next = new Map(before.map((p) => [p.name, p]));
  // "y ≠ 0", "x ∈ {1, 3}", not "y = ≠ 0"
  const show = (p: InlinePart) =>
    p.name + (p.isType ? ": " : /^[≠∈∉]/.test(p.value) ? " " : " = ") + p.value;
  const parts = after.map((p) => {
    const q = next.get(p.name);
    next.delete(p.name);
    if (!q || q.value === p.value) return show(p);
    if (q.isType !== p.isType) return show(p.isType ? q : p);
    return `${show(p)} → ${q.value}`;
  });
  for (const q of next.values()) parts.push(show(q));
  const text = parts.join(", ");
  return text.length > MAX_INLINE ? text.slice(0, MAX_INLINE - 1) + "…" : text;
}

/** A type next to a value is no news (Python: the value is more precise). */
function sameNews(p: InlinePart, q: InlinePart): boolean {
  return p.value === q.value || p.isType !== q.isType;
}

/**
 * The variables of the state before a line worth showing on the line above:
 * the ones its statement changes. The others show on the line itself, in
 * the state after it.
 */
export function changedBefore(before: InlinePart[], after: InlinePart[]): InlinePart[] {
  const post = new Map(after.map((p) => [p.name, p]));
  return before.filter((p) => {
    const q = post.get(p.name);
    return !q || !sameNews(p, q);
  });
}

/** Whether the variable shows in the source line: not a temporary or the
 *  cleanup at a block's "}" (base name of "s.f", "p->x", "*p", "self.x"). */
/** A source line without its strings and comments (blanked, the columns
 *  stay): "data" in a comment names no variable of the line. */
function codeOf(source: string): string {
  return source.replace(
    /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'|\/\*.*?(\*\/|$)|\/\/.*$|#.*$/g,
    (m) => " ".repeat(m.length),
  );
}

function inSource(name: string, source: string): boolean {
  return sourceIndex(name, source) >= 0;
}

/** Where the variable `name` ("a[0]", "s.f": a, s) first occurs in the
 *  source line, -1 if it doesn't (0 for a name without identifier). */
function sourceIndex(name: string, source: string): number {
  const base = /[A-Za-z_$][\w$]*/.exec(name)?.[0];
  if (!base) return 0;
  const m = new RegExp(`(^|[^\\w$])${base.replace(/\$/g, "\\$")}($|[^\\w$])`).exec(codeOf(source));
  return m ? m.index + m[1].length : -1;
}

/** Per call stack: the variables of the source line, null when bottom. */
function partsByContext(
  res: EnvQueryResult<EnvironmentsBody> | undefined,
  python: boolean,
  source: string,
  shown: (d: InlineDomain) => boolean,
  file: string,
): Map<string, InlinePart[] | null> {
  const out = new Map<string, InlinePart[] | null>();
  if (!res || res.kind !== "ok") return out;
  for (const c of res.body.contexts)
    out.set(
      JSON.stringify(c.callstack),
      c.bottom
        ? null
        : // in the order of the line: int *p = &a[2] shows p first
          inlineParts(c.env, python, shown, file)
            .map((p) => ({ p, at: sourceIndex(p.name, source) }))
            .filter(({ at }) => at >= 0)
            .sort((x, y) => x.at - y.at)
            .map(({ p }) => p),
    );
  return out;
}

type LineStates = {
  /** After the line; none for a statement spanning the next lines. */
  post: Map<string, InlinePart[] | null>;
  /** Entering the line. */
  entry: Map<string, InlinePart[] | null>;
};

/**
 * What line L shows under call stack `cs`: the state after L, or before it
 * when nothing comes after (a return), then the variables of the state
 * before L + 1 that L + 1 changes, when L + 1 doesn't show them itself.
 */
function lineText(cs: string, cur: LineStates, next: LineStates | undefined): string {
  const post = cur.post.get(cs);
  const own = (post === null ? cur.entry.get(cs) : post) ?? [];
  const nextPost = next?.post.get(cs);
  const ahead =
    !next || nextPost === null ? [] : changedBefore(next.entry.get(cs) ?? [], nextPost ?? []);
  return mergedInlineText(own, ahead);
}

// ── Relations ────────────────────────────────────────────────────────────

const DECORATIONS = new RegExp(DECORATION.source.slice(0, -1), "g");
const IDENT = /[A-Za-z_$][\w$.]*(\[[^\]]*\])*/g;

/**
 * The constraints of the relational domain in a whole-state print object:
 * under "numeric-relations", or "numeric-relations(<pack>)" with packing,
 * a set of strings ("j + i = n + 1"), or {domain, relations} with
 * -show-relational-domain. Made readable (see relations.ts). With
 * partitions (branches kept apart), the ones of every partition.
 */
export function relationsOf(env: unknown): Set<string> {
  const sets = partitions(env).map((e) => {
    const out: string[] = [];
    const visit = (key: string, v: unknown) => {
      if (key.startsWith("numeric-relations")) {
        const rel =
          v && typeof v === "object" && !Array.isArray(v) && "relations" in v
            ? (v as { relations: unknown }).relations
            : v;
        if (Array.isArray(rel)) for (const c of rel) if (typeof c === "string") out.push(c);
        return;
      }
      if (v && typeof v === "object")
        for (const [k, sub] of Object.entries(v as Record<string, unknown>)) visit(k, sub);
    };
    visit("", e);
    // (simplified before the decorations go: two variables can have one name)
    return new Set(readableRelations(out).map((c) => c.replace(DECORATIONS, "")));
  });
  return new Set([...sets[0]].filter((c) => sets.every((set) => set.has(c))));
}

/** A relation between program variables: two variables at least (one is
 *  only a bound, the intervals show it), none internal to Mopsa (heap
 *  addresses, return values "ret(f)", pointer offsets "offset⦃p⦄"). */
function isRelation(c: string): boolean {
  if (/[@(⦃]/.test(c)) return false;
  return new Set(c.match(IDENT)).size >= 2;
}

/** Relations per call stack, null when bottom. */
function relationsByContext(
  res: EnvQueryResult<EnvironmentsBody> | undefined,
): Map<string, Set<string> | null> {
  const out = new Map<string, Set<string> | null>();
  if (!res || res.kind !== "ok") return out;
  for (const c of res.body.contexts)
    out.set(JSON.stringify(c.callstack), c.bottom ? null : relationsOf(c.env));
  return out;
}

type Where = Exclude<InlineValuesMode, "off">;

const truncate = (text: string) =>
  text.length > MAX_INLINE ? text.slice(0, MAX_INLINE - 1) + "…" : text;

/** One text for several call stacks: the first one, and how many others
 *  differ. */
function contextsText(perContext: string[]): string {
  const texts = [...new Set(perContext.filter(Boolean))];
  if (texts.length === 0) return "";
  return (
    texts[0] +
    (texts.length > 1 ? `  (+${texts.length - 1} other context${texts.length > 2 ? "s" : ""})` : "")
  );
}

/**
 * Values per line:
 *   - "cursor" / "all": line L shows the state after L and what L + 1
 *     changes (see lineText);
 *   - "before" / "after": line L shows its own state before or after it.
 */
async function valueTexts(
  file: string,
  model: Monaco.editor.ITextModel,
  where: Where,
  lines: number[],
  python: boolean,
  shown: (d: InlineDomain) => boolean,
): Promise<Map<number, string>> {
  const merged = where === "all" || where === "cursor";
  if (where === "all") lines = [...new Set(lines.flatMap((l) => [l - 1, l]))].filter((l) => l >= 1);
  const queried = merged
    ? [...new Set(lines.flatMap((l) => [l, l + 1]))].filter((l) => l <= model.getLineCount())
    : lines;
  const fetch = (when: "pre" | "entry" | "post") =>
    Promise.all(queried.map((l) => envEngine.getEnvironments(file, l, "line", when)));
  const [firsts, seconds] = merged
    ? await Promise.all([fetch("post"), fetch("entry")])
    : [await fetch(where === "before" ? "pre" : "post"), []];
  // Merged: the states after and entering each line. Otherwise the one
  // state shown, in `post`.
  const states = new Map<number, LineStates>();
  queried.forEach((l, i) => {
    const source = model.getLineContent(l);
    states.set(l, {
      post: partsByContext(firsts[i], python, source, shown, file),
      entry: partsByContext(seconds[i], python, source, shown, file),
    });
  });
  const out = new Map<number, string>();
  for (const line of lines) {
    const cur = states.get(line);
    if (!cur) continue;
    const next = states.get(line + 1);
    out.set(
      line,
      contextsText(
        merged
          ? [...new Set([...cur.post.keys(), ...cur.entry.keys(), ...(next?.entry.keys() ?? [])])].map(
              (cs) => lineText(cs, cur, next),
            )
          : [...cur.post.values()].map((parts) => mergedInlineText(parts ?? [], [])),
      ),
    );
  }
  return out;
}

/**
 * Relations per line, across call stacks:
 *   - "cursor" / "all": the ones that appear once the line has run, in the
 *     state after it and not in the state entering it. A statement spanning
 *     the next lines (a loop, a conditional) has no state after: the state
 *     entering its body, on the next line, stands for it;
 *   - "before" / "after": the ones holding before or after the line, on
 *     its variables.
 */
async function relationTexts(
  file: string,
  model: Monaco.editor.ITextModel,
  where: Where,
  lines: number[],
): Promise<Map<number, string>> {
  const states = (when: "pre" | "entry" | "post", ls: number[]) =>
    Promise.all(ls.map((l) => envEngine.getEnvironments(file, l, "state", when)));
  const out = new Map<number, string>();
  const put = (line: number, found: Set<string>) => {
    if (found.size > 0) out.set(line, truncate([...found].join(", ")));
  };
  if (where === "before" || where === "after") {
    const res = await states(where === "before" ? "pre" : "post", lines);
    lines.forEach((line, i) => {
      const source = model.getLineContent(line);
      const found = new Set<string>();
      for (const rels of relationsByContext(res[i]).values())
        for (const c of rels ?? [])
          if (isRelation(c) && (c.match(IDENT) ?? []).some((v) => inSource(v, source))) found.add(c);
      put(line, found);
    });
    return out;
  }
  const [posts, entries] = await Promise.all([states("post", lines), states("entry", lines)]);
  const spanning = lines.filter((_, i) => posts[i].kind === "ok" && contextsOf(posts[i]) === 0);
  const bodies = await states("entry", spanning.map((l) => l + 1));
  const bodyOf = new Map(spanning.map((l, i) => [l, bodies[i]]));
  lines.forEach((line, i) => {
    const before = relationsByContext(entries[i]);
    const after = relationsByContext(bodyOf.get(line) ?? posts[i]);
    const found = new Set<string>();
    for (const [cs, rels] of after) {
      const prev = before.get(cs);
      if (!rels || prev === undefined) continue;
      for (const c of rels) if (isRelation(c) && !prev?.has(c)) found.add(c);
    }
    put(line, found);
  });
  return out;
}

function contextsOf(res: EnvQueryResult<EnvironmentsBody>): number {
  return res.kind === "ok" ? res.body.contexts.length : 0;
}

export function useEnvdbOverlays(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  codeFilePath: string,
  enabled: boolean,
  mountKey: number,
) {
  const { phase, generation } = useEnvEngine();
  const showCoverage = useEditorNav((s) => s.showCoverage);
  const inlineValues = useEditorNav((s) => s.inlineValues);
  const inlineHidden = useEditorNav((s) => s.inlineHidden);
  const cursorLine = useEditorNav((s) => s.cursorLine);
  const coverageRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const valuesRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const active = enabled && (showCoverage || inlineValues !== "off");
  useEffect(() => {
    if (active) envEngine.start();
  }, [active]);

  // Stale overlays go as soon as a new analysis starts.
  const ready = phase === "ready";
  useEffect(() => {
    if (ready && enabled) return;
    coverageRef.current?.clear();
    valuesRef.current?.clear();
  }, [ready, enabled]);

  // Coverage + the reached lines (also used by the "all lines" values).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready) return;
    let cancelled = false;
    void envEngine.getLines(codeFilePath).then((res) => {
      if (cancelled || res.kind !== "ok") return;
      const entry = res.body.files[codeFilePath] ?? { reached: [], unreachable: [] };
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      if (showCoverage) {
        for (const line of entry.reached)
          decos.push({
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: { linesDecorationsClassName: "mopsa-cov-reached" },
          });
        for (const line of entry.unreachable)
          decos.push({
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: {
              isWholeLine: true,
              className: "mopsa-cov-dead",
              linesDecorationsClassName: "mopsa-cov-dead-gutter",
              hoverMessage: {
                value: "**Unreachable**: every abstract state reaching this line is ⊥.",
              },
            },
          });
      }
      coverageRef.current?.clear();
      coverageRef.current = editor.createDecorationsCollection(decos);
    });
    return () => {
      cancelled = true;
    };
  }, [editorRef, codeFilePath, enabled, ready, generation, showCoverage, mountKey]);

  // Values are stale as soon as the code changes (lines move, text changes):
  // drop them at once, the next analysis brings fresh ones.
  const code = useAppStore((s) => s.code);
  const lastCode = useRef(code);
  useEffect(() => {
    if (code === lastCode.current) return;
    lastCode.current = code;
    valuesRef.current?.clear();
  }, [code]);

  // Inline values. The cursor only matters in "cursor" mode: in the others,
  // moving it must not refetch and redraw every line.
  const cursorKey = inlineValues === "cursor" ? cursorLine : null;
  const python = codeFilePath.endsWith(".py");
  // Relations need a relational domain in the config.
  const relational = useAppStore((s) => s.configText.includes("numeric.relational"));
  // (a string: the effect runs again when it changes, not the array)
  const hiddenKey = inlineHidden.join(",");
  const showValues = !VALUE_EYES.every((d) => inlineHidden.includes(d));
  const showRelations = !inlineHidden.includes("relations") && relational;
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready || inlineValues === "off") {
      valuesRef.current?.clear();
      return;
    }
    const where = inlineValues;
    const hidden = hiddenKey.split(",");
    let cancelled = false;
    void (async () => {
      let lines: number[];
      if (where === "cursor") lines = cursorKey ? [cursorKey] : [];
      else {
        const res = await envEngine.getLines(codeFilePath);
        if (res.kind !== "ok") return;
        lines = res.body.files[codeFilePath]?.reached ?? [];
      }
      const model = editor.getModel();
      if (cancelled || !model) return;
      lines = lines.filter((l) => l <= model.getLineCount());
      const none = Promise.resolve(new Map<number, string>());
      const [values, relations] = await Promise.all([
        showValues
          ? valueTexts(codeFilePath, model, where, lines, python, (d) => !hidden.includes(d))
          : none,
        showRelations ? relationTexts(codeFilePath, model, where, lines) : none,
      ]);
      if (cancelled) return;
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      for (const line of new Set([...values.keys(), ...relations.keys()])) {
        const text = [values.get(line), relations.get(line)].filter(Boolean).join("  ·  ");
        if (!text) continue;
        const end = model.getLineMaxColumn(line);
        decos.push({
          range: { startLineNumber: line, startColumn: end, endLineNumber: line, endColumn: end },
          options: {
            showIfCollapsed: true,
            after: { content: "  " + text, inlineClassName: "mopsa-inline-value" },
          },
        });
      }
      valuesRef.current?.clear();
      valuesRef.current = editor.createDecorationsCollection(decos);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    editorRef,
    codeFilePath,
    python,
    enabled,
    ready,
    generation,
    inlineValues,
    showValues,
    hiddenKey,
    showRelations,
    cursorKey,
    mountKey,
  ]);
}
