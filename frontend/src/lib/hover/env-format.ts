import type { HoverEnvResult } from "./hover-engine";

/**
 * Turns the JSON print-object returned by Mopsa's `environment` DAP request
 * into Monaco hover markdown for one hovered token.
 *
 * The environment shape depends on the abstract domains: variables may sit
 * at the top level or be nested under grouping nodes (domain names, heap
 * addresses, …), and one variable can appear under several domains. Keys are
 * printed source-level names, possibly composite ("a[0]", "*p", "s.f"), so a
 * token matches every key whose FIRST identifier is the token ("a" matches
 * "a[0]" but not "b[a]").
 */

interface EnvMatch {
  key: string;
  value: unknown;
}

function firstIdentifier(key: string): string | null {
  const m = /[A-Za-z_$][A-Za-z0-9_$]*/.exec(key);
  return m ? m[0] : null;
}

export function findMatches(env: unknown, word: string): EnvMatch[] {
  const out: EnvMatch[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (firstIdentifier(k) === word) {
          const fingerprint = k + "=" + JSON.stringify(v);
          if (!seen.has(fingerprint)) {
            seen.add(fingerprint);
            out.push({ key: k, value: v });
          }
        } else {
          visit(v);
        }
      }
    }
  };
  visit(env);
  return out;
}

/** Flattens one matched entry to indented `key = value` text lines. */
function entryLines(key: string, value: unknown, indent: string): string[] {
  if (value === null || value === undefined) return [indent + key + " = ⊥"];
  if (typeof value !== "object")
    return [indent + key + " = " + String(value)];
  if (Array.isArray(value))
    return [
      indent +
        key +
        " = " +
        value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", "),
    ];
  const lines = [indent + key + ":"];
  for (const [k, v] of Object.entries(value))
    lines.push(...entryLines(k, v, indent + "  "));
  return lines;
}

export interface HoverMarkdown {
  value: string;
}

/**
 * Hover contents for `word` at `line`, or null for no hover (lets other
 * providers/markers through untouched).
 */
export function formatHover(
  result: HoverEnvResult,
  word: string,
  line: number,
): HoverMarkdown[] | null {
  if (result.kind === "unavailable") return null;
  if (result.kind === "analyzing")
    return [
      {
        value:
          "**Mopsa** is analyzing in the background… hover again in a moment.",
      },
    ];

  const matches = findMatches(result.env, word);
  if (matches.length === 0) return null;

  // Mopsa decorates variable names with their declaration/occurrence site
  // ("x:./example.c:5.9-14", "x:test.u:3.0-1"). Display the plain name when
  // it is unambiguous; keep the decorated key only to disambiguate several
  // same-named variables with different values (e.g. caller + callee scopes).
  const cleaned = matches.map((m) => {
    const rendered = entryLines(m.key, m.value, "");
    const short = firstIdentifier(m.key) ?? m.key;
    return { ...m, short, rendered };
  });
  const seen = new Map<string, string>(); // short name -> rendered value text
  const lines: string[] = [];
  for (const m of cleaned) {
    const valueText = m.rendered.join("\n").slice(m.key.length);
    const prev = seen.get(m.short);
    if (prev === valueText) continue; // identical duplicate (other scope)
    const key = prev === undefined ? m.short : m.key;
    if (prev === undefined) seen.set(m.short, valueText);
    lines.push(...entryLines(key, m.value, ""));
  }
  return [
    { value: `**Mopsa** abstract state at line ${line}` },
    { value: "```text\n" + lines.join("\n") + "\n```" },
  ];
}
