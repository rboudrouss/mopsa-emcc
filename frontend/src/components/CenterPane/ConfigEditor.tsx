import MonacoEditor, { type BeforeMount } from "@monaco-editor/react";
import type * as MonacoNS from "monaco-editor";
import { useEffect, useState } from "react";
import { parseConfigText } from "@/lib/mopsa-client";
import { useAppStore } from "@/lib/store";

const DOMAIN_NAMES = [
  "c.memory.lowlevel.smashing",
  "c.memory.lowlevel.cells",
  "cpython.cmodule",
  "cpython.callstack_tracking",
  "c.memory.scalars.pointer",
  "c.libs.clib.file_descriptor",
  "c.iterators.interproc",
  "python.desugar.import",
  "python.types.polymorphism",
  "python.types.structural_types",
  "python.types.type_annot",
  "python.types.addr_env",
  "python.objects.constant_dict",
  "universal.heap.recency",
  "universal.numeric.collecting",
  "universal.numeric.relational",
  "cfg.iterators.intraproc",
  "c.memory.variable_length_array",
  "c.memory.symbolic.rewriting",
  "c.memory.lowlevel.string_length",
  "c.memory.protection",
  "c.memory.lowlevel.pointer_sentinel",
  "c.memory.scalars.machine_numbers",
  "c.memory.aggregates",
  "c.libs.mopsalib",
  "c.libs.variadic",
  "c.libs.clib.formatted_io.fscanf",
  "c.libs.clib.formatted_io.fprint",
  "c.libs.compiler",
  "c.iterators.switch",
  "c.iterators.program",
  "c.iterators.loops",
  "c.iterators.intraproc",
  "c.iterators.goto",
  "c.cstubs.resources",
  "c.cstubs.builtins",
  "c.cstubs.assigns",
  "python.flows.exceptions",
  "python.flows.generators",
  "python.libs.math",
  "python.libs.mopsa",
  "python.libs.stdlib",
  "python.libs.typing",
  "python.libs.unittest",
  "python.desugar.with",
  "python.desugar.loops",
  "python.desugar.iterable_assign",
  "python.desugar.if",
  "python.desugar.comprehensions",
  "python.desugar.bool",
  "python.desugar.assert",
  "python.types.nominal_types",
  "python.types.t_complex",
  "python.types.t_float",
  "python.types.t_int",
  "python.types.t_string",
  "python.objects.range",
  "python.objects.set",
  "python.objects.object",
  "python.objects.lambda",
  "python.objects.iterable",
  "python.objects.tuple",
  "python.objects.function",
  "python.objects.dict",
  "python.objects.list",
  "python.objects.class",
  "python.data_model.subscript",
  "python.data_model.compare_ops",
  "python.data_model.callable",
  "python.data_model.aug_assign",
  "python.data_model.attribute",
  "python.data_model.arith_ops",
  "python.program",
  "universal.repl",
  "stubs.iterators.body",
  "stubs.iterators.fallback",
  "universal.iterators.interproc.inlining",
  "universal.iterators.interproc.sequential_cache",
  "universal.iterators.intraproc",
  "universal.iterators.loops",
  "universal.iterators.program",
  "universal.iterators.unittest",
  "universal.toy.string_length",
  "universal.toy.string_summarization",
  "python.types.dummy_numeric",
  "universal.strings.powerset",
  "universal.numeric.values.zero",
  "universal.numeric.values.powersets.standard",
  "universal.numeric.values.powersets.excluded",
  "universal.numeric.values.congruences",
  "universal.numeric.values.intervals.integer",
  "universal.numeric.values.intervals.float",
  "universal.numeric.values.bitmask",
  "c.memory.packing.static_scope",
  "python.packing.static_scope",
  "universal.partitioning.int-var",
  "universal.partitioning.tail-markers",
] as const;

function registerMopsaConfigSchema(monaco: typeof MonacoNS) {
  const ref = (name: string) => ({ $ref: `#/definitions/${name}` });

  const domainExpr = {
    oneOf: [
      ref("domainName"),
      ref("switchObject"),
      ref("composeObject"),
      ref("nonrelObject"),
      ref("unionObject"),
      ref("productObject"),
      ref("applyObject"),
    ],
  };

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    comments: "ignore" as "ignore",
    trailingCommas: "ignore" as "ignore",
    schemas: [
      {
        uri: "http://mopsa/config-schema.json",
        fileMatch: ["**"],
        schema: {
          type: "object",
          required: ["language", "domain"],
          properties: {
            language: {
              type: "string",
              enum: ["c", "python", "universal", "cfg"],
              description: "Target language for analysis",
            },
            domain: domainExpr,
          },
          definitions: {
            domainName: {
              type: "string",
              enum: [...DOMAIN_NAMES],
              description: "Name of an abstract domain",
            },
            domainExpr,
            switchObject: {
              type: "object",
              required: ["switch"],
              additionalProperties: false,
              properties: {
                semantic: {
                  type: "string",
                  enum: ["C", "Python", "Universal", "C/Scalar"],
                  description: "Semantic context",
                },
                switch: {
                  type: "array",
                  items: domainExpr,
                  description:
                    "Priority switch: first matching domain handles the query",
                },
              },
            },
            composeObject: {
              type: "object",
              required: ["compose"],
              additionalProperties: false,
              properties: {
                compose: {
                  type: "array",
                  items: domainExpr,
                  description: "Sequential composition of domains",
                },
              },
            },
            nonrelObject: {
              type: "object",
              required: ["nonrel"],
              additionalProperties: false,
              properties: {
                nonrel: {
                  ...domainExpr,
                  description: "Non-relational lifting of a value domain",
                },
              },
            },
            unionObject: {
              type: "object",
              required: ["union"],
              additionalProperties: false,
              properties: {
                union: {
                  type: "array",
                  items: domainExpr,
                  description: "Union of value domains",
                },
              },
            },
            productObject: {
              type: "object",
              required: ["product"],
              additionalProperties: false,
              properties: {
                product: {
                  type: "array",
                  items: domainExpr,
                  description: "Reduced product of domains",
                },
                reductions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Reduction operators between product components",
                },
              },
            },
            applyObject: {
              type: "object",
              required: ["apply", "on"],
              additionalProperties: false,
              properties: {
                apply: {
                  ...domainExpr,
                  description: "Functor domain to apply",
                },
                on: {
                  ...domainExpr,
                  description: "Domain to apply the functor on",
                },
              },
            },
          },
        },
      },
    ],
  });
}

function defineThemes(monaco: typeof MonacoNS) {
  monaco.editor.defineTheme("mopsa-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0f1117",
      "editor.foreground": "#e8eaf0",
      "editorLineNumber.foreground": "#4a5470",
      "editorGutter.background": "#0f1117",
    },
  });
  monaco.editor.defineTheme("mopsa-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1a1e2e",
      "editorGutter.background": "#ffffff",
    },
  });
}

interface ConfigEditorProps {
  resolvedTheme: "light" | "dark";
}

export function ConfigEditor({ resolvedTheme }: ConfigEditorProps) {
  const configText = useAppStore((s) => s.configText);
  const configDirty = useAppStore((s) => s.configDirty);
  const lang = useAppStore((s) => s.lang);
  const crossLanguage = useAppStore((s) => s.crossLanguage);
  const customConfigs = useAppStore((s) => s.customConfigs);
  const setConfigText = useAppStore((s) => s.setConfigText);
  const applyCustom = useAppStore((s) => s.applyCustom);

  const configKey = crossLanguage ? "multilanguage" : lang;
  const hasCustom = !!customConfigs[configKey];
  const isValidJson = parseConfigText(configText) !== null;

  // user explicitly chose to overwrite the existing custom
  const [userAccepted, setUserAccepted] = useState(false);

  // Reset acceptance when leaving custom
  useEffect(() => {
    if (!configDirty) setUserAccepted(false);
  }, [configDirty, configKey]);

  // Editor is blocked when NOT on custom AND a saved custom exists AND user hasn't accepted
  const isBlocked = !configDirty && hasCustom && !userAccepted;

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineThemes(monaco);
    registerMopsaConfigSchema(monaco);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar — only visible when JSON is invalid */}
      {!isValidJson && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 12px",
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#f87171",
              background: "rgba(248,113,113,.12)",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            Invalid JSON
          </span>
        </div>
      )}

      {isBlocked && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: "rgba(251,191,36,.08)",
            borderBottom: "1px solid rgba(251,191,36,.3)",
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: "#fbbf24" }}>
            ⚠ A saved custom configuration exists for this language. Editing
            this configuration will override the saved custom.
          </span>
          <button
            onClick={() => setUserAccepted(true)}
            style={{
              fontSize: 11,
              color: "#fbbf24",
              background: "rgba(251,191,36,.15)",
              border: "1px solid rgba(251,191,36,.4)",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Override
          </button>
        </div>
      )}

      {/* Editor */}
      <div style={{ flex: 1 }}>
        <MonacoEditor
          height="100%"
          language="json"
          value={configText}
          theme={resolvedTheme === "dark" ? "mopsa-dark" : "mopsa-light"}
          beforeMount={handleBeforeMount}
          onChange={(v) => setConfigText(v ?? "", true)}
          options={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            tabSize: 2,
            wordWrap: "off",
            folding: true,
            readOnly: isBlocked,
            fixedOverflowWidgets: true,
          }}
        />
      </div>
    </div>
  );
}
