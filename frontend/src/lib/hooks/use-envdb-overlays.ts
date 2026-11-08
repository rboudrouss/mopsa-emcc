import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import {
  envEngine,
  type EnvQueryResult,
  type EnvironmentsBody,
} from "../envdb/env-engine";
import { useEnvEngine } from "./use-env-engine";
import { useEditorNav } from "../editor-nav";
import { useAppStore } from "../store";

/**
 * Editor overlays fed by the environment database of the background
 * analysis (see env-engine.ts):
 *   - coverage: a gutter bar on the lines the analysis reached, and a grey
 *     background on the lines it found unreachable (every state is ⊥);
 *   - inline values: after the code of a line, the abstract values of its
 *     variables once it has run, and of the next line's variables before
 *     that one runs when its statement changes them (cursor line only, or
 *     every line); or, on every line, only the state before it, only the
 *     state after it, or the relations between variables it brings (with a
 *     relational domain).
 */

const MAX_INLINE = 70;
const VAR_LIKE = /^[A-Za-z_$][\w$]*(\[[^\]]*\]|\.[\w$]+|->[\w$]+)*$/;
const DECORATION = /:[^\s:]+:\d+\.\d+(-\d+(\.\d+)?)?$/;
// Python heap addresses of callables, classes and modules: noise inline.
const PY_HIDDEN =
  /^@(function|builtin_function_or_method|method|classmethod|staticmethod|module|type)\b/;

/**
 * One value as shown inline. Python variables point to heap addresses
 * ("@Inst{int}:w", "@list"): shown as their type, and hidden (null) for
 * functions, classes and modules.
 */
function valueText(v: unknown, python: boolean): string | null {
  if (v === null || v === undefined) return "⊥";
  const s = (typeof v === "object" ? JSON.stringify(v) : String(v))
    .replace(/\s+/g, " ")
    .trim();
  if (!python || !s.startsWith("@")) return s;
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

/** The variables of a line-scope print object. A variable printed by
 *  several domains (Python: its type in the environment, its value in the
 *  numeric domain) is shown once, by value when there is one. */
export function inlineParts(env: unknown, python = false): InlinePart[] {
  const vars = new Map<string, { types: Set<string>; values: string[] }>();
  const entry = (name: string) => {
    let e = vars.get(name);
    if (!e) vars.set(name, (e = { types: new Set(), values: [] }));
    return e;
  };
  const leaf = (key: string, v: unknown) => {
    if (!key || key.startsWith("@")) return; // heap addresses' internals
    const list = Array.isArray(v) ? v : [v];
    const texts = list.map((x) => valueText(x, python));
    if (texts.some((x) => x === null)) return; // a callable, class, module
    const isType = python && list.every((x) => String(x).startsWith("@"));
    const text = [...new Set(texts as string[])].join(isType ? " | " : ", ");
    if (isType) entry(key).types.add(text);
    else entry(key).values.push(Array.isArray(v) ? `{${text}}` : text);
  };
  const visit = (key: string, v: unknown, depth: number) => {
    if (v && typeof v === "object" && !Array.isArray(v))
      for (const [k, sub] of Object.entries(v as Record<string, unknown>))
        // The top-level keys are domain groups ("float-itv ∪ int-itv",
        // "environment"): they aren't part of the names.
        visit(
          depth > 1 && VAR_LIKE.test(key) ? `${key}.${k}` : k.replace(DECORATION, ""),
          sub,
          depth + 1,
        );
    else leaf(key, v);
  };
  if (env === null || env === undefined) return [];
  visit("", env, 0);
  return [...vars].map(([name, { types, values }]) =>
    values.length > 0
      ? { name, value: [...new Set(values)].join(" ∧ "), isType: false }
      : { name, value: [...types].join(" | "), isType: true },
  );
}

/**
 * The text shown at the end of a line: the state after it, then what
 * changes in the state before the next line, each variable once. A variable whose value differs
 * between the two (entering a branch or a loop) shows both, "i = 0 → [0,9]".
 */
export function mergedInlineText(after: InlinePart[], before: InlinePart[]): string {
  const next = new Map(before.map((p) => [p.name, p]));
  const show = (p: InlinePart) => p.name + (p.isType ? ": " : " = ") + p.value;
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
function inSource(name: string, source: string): boolean {
  const base = /[A-Za-z_$][\w$]*/.exec(name)?.[0];
  return !base || new RegExp(`(^|[^\\w$])${base.replace(/\$/g, "\\$")}($|[^\\w$])`).test(source);
}

/** Per call stack: the variables of the source line, null when bottom. */
function partsByContext(
  res: EnvQueryResult<EnvironmentsBody> | undefined,
  python: boolean,
  source: string,
): Map<string, InlinePart[] | null> {
  const out = new Map<string, InlinePart[] | null>();
  if (!res || res.kind !== "ok") return out;
  for (const c of res.body.contexts)
    out.set(
      JSON.stringify(c.callstack),
      c.bottom ? null : inlineParts(c.env, python).filter((p) => inSource(p.name, source)),
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
 * -show-relational-domain.
 */
export function relationsOf(env: unknown): Set<string> {
  const out = new Set<string>();
  const visit = (key: string, v: unknown) => {
    if (key.startsWith("numeric-relations")) {
      const rel =
        v && typeof v === "object" && !Array.isArray(v) && "relations" in v
          ? (v as { relations: unknown }).relations
          : v;
      if (Array.isArray(rel))
        for (const c of rel) if (typeof c === "string") out.add(c.replace(DECORATIONS, ""));
      return;
    }
    if (v && typeof v === "object")
      for (const [k, sub] of Object.entries(v as Record<string, unknown>)) visit(k, sub);
  };
  visit("", env);
  return out;
}

/** A relation between program variables: two variables at least (one is
 *  only a bound, the intervals show it), none internal to Mopsa (heap
 *  addresses, return values "ret(f)"). */
function isRelation(c: string): boolean {
  if (/[@(]/.test(c)) return false;
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

/**
 * Per line, the relations that appear once it has run: in the state after
 * it and not in the state entering it. A statement spanning the next lines
 * (a loop, a conditional) has no state after: the state entering its body,
 * on the next line, stands for it.
 */
async function newRelations(file: string, lines: number[]): Promise<Map<number, string[]>> {
  const states = (when: "entry" | "post", ls: number[]) =>
    Promise.all(ls.map((l) => envEngine.getEnvironments(file, l, "state", when)));
  const [posts, entries] = await Promise.all([states("post", lines), states("entry", lines)]);
  const spanning = lines.filter((_, i) => posts[i].kind === "ok" && contextsOf(posts[i]) === 0);
  const bodies = await states("entry", spanning.map((l) => l + 1));
  const bodyOf = new Map(spanning.map((l, i) => [l, bodies[i]]));
  const out = new Map<number, string[]>();
  lines.forEach((line, i) => {
    const before = relationsByContext(entries[i]);
    const after = relationsByContext(bodyOf.get(line) ?? posts[i]);
    const found = new Set<string>();
    for (const [cs, rels] of after) {
      const prev = before.get(cs);
      if (!rels || prev === undefined) continue;
      for (const c of rels) if (isRelation(c) && !prev?.has(c)) found.add(c);
    }
    const text = [...found].join(", ");
    if (text) out.set(line, [text.length > MAX_INLINE ? text.slice(0, MAX_INLINE - 1) + "…" : text]);
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
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready || inlineValues === "off") {
      valuesRef.current?.clear();
      return;
    }
    let cancelled = false;
    // One text per call stack: the first one, and how many others differ.
    const decorate = (perLine: [number, string[]][]) => {
      const model = editor.getModel();
      if (!model) return;
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      for (const [line, perContext] of perLine) {
        const texts = [...new Set(perContext.filter(Boolean))];
        if (texts.length === 0) continue;
        const text =
          texts[0] +
          (texts.length > 1
            ? `  (+${texts.length - 1} other context${texts.length > 2 ? "s" : ""})`
            : "");
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
    };
    void (async () => {
      // "all": line L shows the state after L and what L + 1 changes
      // (see lineText); "before" / "after": line L shows its own state only;
      // "relations": the relations L brings (see newRelations).
      const mode = inlineValues;
      let lines: number[];
      if (mode === "cursor") lines = cursorKey ? [cursorKey] : [];
      else {
        const res = await envEngine.getLines(codeFilePath);
        if (res.kind !== "ok") return;
        const reached = res.body.files[codeFilePath]?.reached ?? [];
        lines =
          mode === "all"
            ? [...new Set(reached.flatMap((l) => [l - 1, l]))].filter((l) => l >= 1)
            : reached;
      }
      const model = editor.getModel();
      if (cancelled || !model) return;
      lines = lines.filter((l) => l <= model.getLineCount());
      if (mode === "relations") {
        const rels = await newRelations(codeFilePath, lines);
        if (cancelled) return;
        decorate([...rels]);
        return;
      }
      const merged = mode === "all" || mode === "cursor";
      const queried = merged
        ? [...new Set(lines.flatMap((l) => [l, l + 1]))].filter((l) => l <= model.getLineCount())
        : lines;
      const fetch = (when: "pre" | "entry" | "post") =>
        Promise.all(queried.map((l) => envEngine.getEnvironments(codeFilePath, l, "line", when)));
      const [firsts, seconds] = merged
        ? await Promise.all([fetch("post"), fetch("entry")])
        : [await fetch(mode === "before" ? "pre" : "post"), []];
      if (cancelled) return;
      // Merged modes: the states after and entering each line. The others:
      // the one state shown, in `post`.
      const states = new Map<number, LineStates>();
      queried.forEach((l, i) => {
        const source = model.getLineContent(l);
        states.set(l, {
          post: partsByContext(firsts[i], python, source),
          entry: partsByContext(seconds[i], python, source),
        });
      });
      const perLine: [number, string[]][] = lines.map((line) => {
        const cur = states.get(line)!;
        const next = states.get(line + 1);
        return [
          line,
          merged
            ? [...new Set([...cur.post.keys(), ...cur.entry.keys(), ...(next?.entry.keys() ?? [])])].map(
                (cs) => lineText(cs, cur, next),
              )
            : [...cur.post.values()].map((parts) => mergedInlineText(parts ?? [], [])),
        ];
      });
      decorate(perLine);
    })();
    return () => {
      cancelled = true;
    };
  }, [editorRef, codeFilePath, python, enabled, ready, generation, inlineValues, cursorKey, mountKey]);
}
