import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BOOL_ARG_FLAGS,
  DEFAULT_OPTION_VALUES,
  MOPSA_DEFAULT_VALUES,
  OPTIONS_SCHEMA,
  SELECT_FLAGS,
  type OptionSpec,
} from "./options-schema";
import { getBackend } from "./backend";
import { useAppStore } from "./store";

/**
 * Options panel driven by Mopsa itself: `-format=json -config=… -help`
 * lists the options of the analyzer and of the domains of the current
 * config. The hand-written OPTIONS_SCHEMA stays the source of labels, UI
 * defaults and widgets; Mopsa's list decides which of its options apply to
 * the current config, and brings the options the schema doesn't know.
 */

export interface HelpEntry {
  key: string;
  doc: string;
  category: string;
  default: string;
  type: string;
}

export interface OptionsGroupView {
  group: string;
  options: OptionSpec[];
}

// Driven by the app itself (worker argv, engine switch, results parsing) or
// meaningless in a browser.
const SKIPPED = new Set([
  "-config",
  "-share-dir",
  "-format",
  "-output",
  "-engine",
  "-help",
  "-list",
  "-working-dir",
  "-interactive",
  "-v",
]);

const CURATED = new Set(
  OPTIONS_SCHEMA.flatMap((g) => g.options.map((o) => o.flag)),
);

function titleCase(category: string): string {
  return category
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Widget spec for an option known only from Mopsa's help. */
function specOfHelp(h: HelpEntry): OptionSpec | null {
  const base = { flag: h.key, label: h.key, hint: h.doc };
  if (h.type === "bool")
    return { ...base, type: "boolArg", default: h.default === "true" };
  // Set / Clear specs act by their mere presence: a switch passing the flag.
  if (h.type === "set" || h.type === "clear")
    return { ...base, type: "bool", default: false };
  if (h.type === "int") {
    const n = parseInt(h.default, 10);
    return { ...base, type: "int", default: Number.isNaN(n) ? "" : n };
  }
  if (h.type === "string" || h.type === "float")
    return { ...base, type: "text", default: h.default ?? "" };
  if (h.type.startsWith("symbol:")) {
    const choices = h.type.slice("symbol:".length).split(",");
    return {
      ...base,
      type: "select",
      default: choices.includes(h.default) ? h.default : choices[0],
      choices,
    };
  }
  return null; // unit / tuple / rest: actions, not settings
}

// Dynamic options are remembered across reloads: a saved value must be
// turned into argv correctly (e.g. `-flag true` for a Bool spec) before
// Mopsa's help is fetched again.
const REGISTRY_KEY = "mopsa-dynamic-options";
type Registered = Pick<OptionSpec, "type" | "default">;
const registry: Record<string, Registered> = (() => {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "{}");
  } catch {
    return {};
  }
})();

function apply(flag: string, r: Registered): void {
  DEFAULT_OPTION_VALUES[flag] = r.default;
  MOPSA_DEFAULT_VALUES[flag] = r.default;
  if (r.type === "select") SELECT_FLAGS.add(flag);
  if (r.type === "boolArg") BOOL_ARG_FLAGS.add(flag);
}

for (const [flag, r] of Object.entries(registry))
  if (!CURATED.has(flag)) apply(flag, r);

/** Makes a dynamic option known to the flag builder and the defaults. */
function register(spec: OptionSpec): void {
  const known = registry[spec.flag];
  if (known && known.type === spec.type && known.default === spec.default)
    return;
  registry[spec.flag] = { type: spec.type, default: spec.default };
  apply(spec.flag, registry[spec.flag]);
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* no localStorage */
  }
}

function parseHelp(raw: string): HelpEntry[] | null {
  const i = raw.search(/^\[/m);
  if (i < 0) return null;
  try {
    const list = JSON.parse(raw.slice(i)) as HelpEntry[];
    if (!Array.isArray(list) || !list.every((e) => typeof e?.key === "string"))
      return null;
    return list;
  } catch {
    return null;
  }
}

/** Groups to show: the curated ones restricted to what Mopsa lists for this
 *  config (plus any option the user changed), then Mopsa's other options. */
export function buildOptionsView(
  help: HelpEntry[] | null,
  values: Record<string, unknown>,
): OptionsGroupView[] {
  const curated = OPTIONS_SCHEMA.map((g) => ({
    group: g.group,
    options: g.options.filter((o) => !o.hidden),
  }));
  if (!help) return curated.filter((g) => g.options.length > 0);

  const listed = new Set(help.map((h) => h.key));
  const modified = (o: OptionSpec) =>
    values[o.flag] !== undefined && values[o.flag] !== DEFAULT_OPTION_VALUES[o.flag];
  const groups = curated.map((g) => ({
    group: g.group,
    options: g.options.filter(
      (o) => o.flag.startsWith("__") || listed.has(o.flag) || modified(o),
    ),
  }));

  for (const h of help) {
    if (CURATED.has(h.key) || SKIPPED.has(h.key)) continue;
    const spec = specOfHelp(h);
    if (!spec) continue;
    register(spec);
    const name = titleCase(h.category || "Other");
    let g = groups.find((x) => x.group.toLowerCase() === name.toLowerCase());
    if (!g) {
      g = { group: name, options: [] };
      // Keep "Advanced" (raw flags) last.
      const adv = groups.findIndex((x) => x.group === "Advanced");
      groups.splice(adv < 0 ? groups.length : adv, 0, g);
    }
    g.options.push(spec);
  }
  return groups.filter((g) => g.options.length > 0);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Mopsa's option list for the current config, or null while loading / when
 * this Mopsa build can't print it (the panel then shows the whole schema).
 */
export function useHelpOptions(): HelpEntry[] | null {
  const configText = useDebounced(
    useAppStore((s) => s.configText),
    800,
  );
  const { data } = useQuery({
    queryKey: ["mopsa-help", getBackend(), configText],
    queryFn: async () => {
      if (typeof mopsaJs.query !== "function") return null;
      // -help prints when parsed: -format and -config must come first.
      const raw = await mopsaJs.query([
        "-format=json",
        "-config",
        "/config.json",
        "-help",
      ]);
      return parseHelp(raw);
    },
    enabled: !!configText,
    staleTime: Infinity,
    retry: false,
  });
  return data ?? null;
}
