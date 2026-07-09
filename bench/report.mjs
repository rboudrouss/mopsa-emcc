// Render a benchmark payload (from run.mjs) to Markdown + CSV.
// Standalone:  node report.mjs [results/latest.json]
import { readFileSync, writeFileSync } from "node:fs";
import { median } from "./lib/metrics.mjs";

const fmt = (x, d = 0) => (x == null ? "—" : x.toFixed(d));
const fmtMs = (x) => (x == null ? "—" : x >= 1000 ? `${(x / 1000).toFixed(2)}s` : `${x.toFixed(0)}ms`);

function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [
    line(headers),
    line(headers.map(() => "---")),
    ...rows.map((r) => line(r)),
  ].join("\n");
}

export function renderMarkdown(p) {
  const targets = p.targets;
  const rowsByTarget = (t) => p.rows.filter((r) => r.target === t);
  const cell = (t, id, key, f) => {
    const row = p.rows.find((r) => r.target === t && r.id === id);
    return row ? f(row[key]) : "—";
  };

  const out = [];
  out.push(`# Mopsa — Rapport de performance multi-backend\n`);
  out.push(`- Généré : ${p.generatedAt}`);
  out.push(`- Node : ${p.node} · répétitions : ${p.reps} (médiane rapportée)`);
  out.push(`- Cibles : ${targets.join(", ")}\n`);

  // Availability / skips
  const skipped = Object.entries(p.availability).filter(([, v]) => v);
  if (skipped.length) {
    out.push(`## Cibles ignorées\n`);
    for (const [t, why] of skipped) out.push(`- **${t}** : ${why}`);
    out.push("");
  }

  // Metric legend
  out.push(`## Métriques\n`);
  out.push(`- **inst.** : instanciation du runtime avant analyse — wasm : compile+instancie le module + décompresse le .data ; jsoo : parse le bundle JS (~22 Mo). Mesuré séparément de l'analyse. Nul pour native.`);
  out.push(`- **run froid** : 1ʳᵉ analyse, code wasm/JS pas encore optimisé par V8 (**Liftoff**). C'est ce que voit un usage one-shot (CLI).`);
  out.push(`- **run chaud** : analyses suivantes, une fois le code monté en **TurboFan** (régime permanent d'un onglet/serveur long). wasm : mesuré en réutilisant le \`Module\` compilé ; jsoo-node : \`—\` (l'état runtime OCaml ne peut pas être ré-entré dans le même process — le navigateur respawn le worker, donc jsoo reste froid).`);
  out.push(`- **froid+inst.** : inst. + run froid = latence d'un démarrage à froid complet + 1 analyse (hors boot process).`);
  out.push(`- **analyse (Mopsa)** : temps rapporté par Mopsa (\`Analysis time\`). Fiable en natif et jsoo ; le runtime **wasm renvoie toujours 0.000s** (horloge non implémentée) → \`n/a\`.`);
  out.push(`- **total** : wall-clock complet du process (boot node/native inclus). Node/native uniquement.`);
  out.push(`- **RSS** : mémoire pic (native : /proc VmRSS sous-arbre ; node : rusage maxRSS ; navigateur : heap JS approx., worker non compté).`);
  out.push(`- **Navigateur** : le worker ré-instancie le module à chaque analyse ; *inst.* = démarrage initial one-shot (fetch+compile, 1×). ⚠ La page est **partagée entre fichiers**, donc seul le tout 1ᵉʳ fichier est vraiment *froid* — V8 garde les fonctions mopsa chaudes ensuite. La colonne *run froid* navigateur est donc quasi-chaude ; comparer plutôt les **run chaud** entre node et navigateur (≈ égaux → l'écart initial venait du froid, pas de la plateforme).\n`);

  // Summary per target (medians across all its files)
  out.push(`## Synthèse par cible\n`);
  const summary = targets
    .filter((t) => rowsByTarget(t).length)
    .map((t) => {
      const rs = rowsByTarget(t);
      const analysis = median(rs.map((r) => r.analysisMs));
      const load = median(rs.map((r) => r.loadMs));
      const cold = median(rs.map((r) => r.runColdMs));
      const warm = median(rs.map((r) => r.runWarmMs));
      const coldWithInst = load != null && cold != null ? load + cold : null;
      return [
        t,
        String(rs.length),
        load != null ? fmtMs(load) : "—",
        fmtMs(cold),
        warm != null ? fmtMs(warm) : "—",
        coldWithInst != null ? fmtMs(coldWithInst) : "—",
        t.startsWith("wasm") ? "n/a" : fmtMs(analysis),
        fmtMs(median(rs.map((r) => r.totalWallMs))),
        fmt(median(rs.map((r) => r.peakRssMB)), 0),
      ];
    });
  out.push(mdTable(
    ["cible", "fichiers", "inst. (méd.)", "run froid", "run chaud", "froid+inst.", "analyse Mopsa", "total", "RSS MB"],
    summary,
  ));
  out.push("");

  // Per-file analysis-time comparison, grouped by language
  const langs = [...new Set(p.corpus.map((c) => c.lang))];
  for (const lang of langs) {
    const files = p.corpus.filter((c) => c.lang === lang);
    if (!files.length) continue;
    out.push(`## ${lang} — temps d'exécution \`froid / chaud\` par fichier\n`);
    const activeTargets = targets.filter((t) =>
      p.rows.some((r) => r.target === t && r.lang === lang),
    );
    if (!activeTargets.length) {
      out.push(`_(aucune cible n'a analysé de fichiers ${lang})_\n`);
      continue;
    }
    // Each cell = "froid / chaud". Targets with no warm measurement (native,
    // jsoo — runtime not re-enterable) show the cold value only.
    const coldWarm = (t, id) => {
      const r = p.rows.find((x) => x.target === t && x.id === id);
      if (!r) return "—";
      const cold = fmtMs(r.runColdMs);
      return r.runWarmMs != null ? `${cold} / ${fmtMs(r.runWarmMs)}` : cold;
    };
    const rows = files.map((f) => [
      `\`${f.id.split("/").pop()}\``,
      String(f.lines),
      ...activeTargets.map((t) => coldWarm(t, f.id)),
    ]);
    out.push(mdTable(["fichier", "lignes", ...activeTargets], rows));
    out.push("");
  }

  // Total wall-clock + memory (node/native only)
  const localTargets = targets.filter((t) => !t.endsWith("browser") && rowsByTarget(t).length);
  if (localTargets.length) {
    out.push(`## Wall-clock total & mémoire (native / node)\n`);
    for (const lang of langs) {
      const files = p.corpus.filter((c) => c.lang === lang);
      const active = localTargets.filter((t) => p.rows.some((r) => r.target === t && r.lang === lang));
      if (!active.length) continue;
      out.push(`### ${lang}\n`);
      const rows = files
        .filter((f) => active.some((t) => p.rows.some((r) => r.target === t && r.id === f.id)))
        .map((f) => [
          `\`${f.id.split("/").pop()}\``,
          ...active.map((t) => cell(t, f.id, "totalWallMs", fmtMs)),
          ...active.map((t) => cell(t, f.id, "peakRssMB", (x) => fmt(x, 0))),
        ]);
      out.push(mdTable(
        ["fichier", ...active.map((t) => `${t} total`), ...active.map((t) => `${t} RSS`)],
        rows,
      ));
      out.push("");
    }
  }

  return out.join("\n");
}

export function renderCsv(p) {
  const cols = ["target", "backend", "env", "id", "lang", "lines", "reps", "okReps",
    "analysisMs", "runMs", "loadMs", "totalWallMs", "peakRssMB", "status"];
  const lines = [cols.join(",")];
  for (const r of p.rows) {
    lines.push(cols.map((c) => {
      const v = r[c];
      if (v == null) return "";
      return typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v);
    }).join(","));
  }
  return lines.join("\n");
}

export function writeReports(payload, jsonPath) {
  const mdPath = jsonPath.replace(/\.json$/, ".md");
  const csvPath = jsonPath.replace(/\.json$/, ".csv");
  writeFileSync(mdPath, renderMarkdown(payload));
  writeFileSync(csvPath, renderCsv(payload));
  return { mdPath, csvPath };
}

// Standalone entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonPath = process.argv[2] || new URL("./results/latest.json", import.meta.url).pathname;
  const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
  const { mdPath, csvPath } = writeReports(payload, jsonPath);
  console.error(`Wrote ${mdPath} and ${csvPath}`);
}
