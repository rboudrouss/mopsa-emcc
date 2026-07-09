type OptionType = "bool" | "boolArg" | "int" | "text" | "select";

export interface OptionSpec {
  flag: string;
  type: OptionType;
  default: unknown;
  /** Mopsa's actual CLI default, when it differs from `default` */
  mopsaDefault?: unknown;
  label: string;
  hint: string;
  min?: number;
  max?: number;
  choices?: string[];
  /** Kept in the schema (for defaults/flag formatting) but not rendered in the
   *  generic OptionsPanel — surfaced through a dedicated control instead. */
  hidden?: boolean;
}

export const OPTIONS_SCHEMA: { group: string; options: OptionSpec[] }[] = [
  {
    group: "Alarms",
    options: [
      {
        flag: "-show-callstacks",
        type: "bool",
        default: false,
        label: "Show callstacks",
        hint: "Display call stacks in alarm reports",
      },
      {
        flag: "-show-safe-checks",
        type: "bool",
        default: true,
        mopsaDefault: false,
        label: "Show safe checks",
        hint: "Show safe checks in alarm reports (enabled by default in this UI)",
      },
    ],
  },
  {
    group: "C",
    options: [
      {
        flag: "-c-entry",
        type: "text",
        default: "main",
        label: "Entry function",
        hint: "Name of the analysis entry point",
      },
      {
        flag: "-without-libc",
        type: "bool",
        default: false,
        label: "Without libc",
        hint: "Disable standard C library stubs",
      },
      {
        flag: "-c-symbolic-args",
        type: "text",
        default: "",
        label: "Symbolic args",
        hint: "Symbolic argument count for main (syntax: min[:max])",
      },
      {
        flag: "-c-symbolic-args-min-size",
        type: "int",
        default: 1,
        min: 0,
        label: "Symbolic args min size",
        hint: "Minimum allocated size of all symbolic arguments",
      },
      {
        flag: "-c-symbolic-args-max-size",
        type: "text",
        default: "",
        label: "Symbolic args max size",
        hint: "Maximum allocated size of all symbolic arguments",
      },
      {
        flag: "-cell-smash",
        type: "bool",
        default: false,
        label: "Cell smashing",
        hint: "On-demand smashing when expansion threshold is reached",
      },
      {
        flag: "-cell-smash-only-pointers",
        type: "bool",
        default: false,
        label: "Smash only pointers",
        hint: "On-demand smashing happens only on pointers",
      },
      {
        flag: "-cell-deref-expand",
        type: "int",
        default: 1,
        min: 0,
        max: 100,
        label: "Cell deref expand",
        hint: "Maximal number of expanded cells when dereferencing a pointer",
      },
      {
        flag: "-I",
        type: "text",
        default: "",
        label: "Include path",
        hint: "Add directory to the search path for include files",
      },
      {
        flag: "-Wall",
        type: "bool",
        default: false,
        label: "Compiler warnings",
        hint: "Display compiler warnings",
      },
      {
        flag: "-ccopt",
        type: "text",
        default: "",
        label: "Clang options",
        hint: "Pass option to the Clang frontend",
      },
      {
        flag: "-additional-stubs",
        type: "text",
        default: "",
        label: "Additional stubs",
        hint: "Additional stubs file",
      },
      {
        flag: "-use-stub",
        type: "text",
        default: "",
        label: "Use stub",
        hint: "Functions for which the stub is used instead of the declaration",
      },
      {
        flag: "-c-track-string-length",
        type: "boolArg",
        default: true,
        label: "Track string length",
        hint: "Track lengths of dynamic strings",
      },
      {
        flag: "-c-init-memset-threshold",
        type: "int",
        default: 50,
        min: 0,
        label: "Memset init threshold",
        hint: "Size threshold (bytes) for using memset to initialize memory blocks",
      },
      {
        flag: "-c-ignore-translation-units",
        type: "text",
        default: "",
        label: "Ignore translation units",
        hint: "List of translation units ignored during linking",
      },
      {
        flag: "-c-no-project-storage",
        type: "bool",
        default: false,
        label: "No project storage",
        hint: "Do not keep the full project in memory",
      },
      {
        flag: "-c-preprocess-and-exit",
        type: "text",
        default: "",
        label: "Preprocess and exit",
        hint: "Save whole project into a single preprocessed file then exit",
      },
      {
        flag: "-error-is-builtin",
        type: "boolArg",
        default: true,
        label: "Error is builtin",
        hint: "Assume error function corresponds to the builtin",
      },
      {
        flag: "-make-target",
        type: "text",
        default: "",
        label: "Make target",
        hint: "Binary target to analyze when Makefile builds multiple targets",
      },
      {
        flag: "-target-triple",
        type: "text",
        default: "",
        label: "Target triple",
        hint: "Target architecture triple (host if empty)",
      },
      {
        flag: "-disable-parser-cache",
        type: "bool",
        default: false,
        label: "Disable parser cache",
        hint: "Disable the cache of the Clang parser",
      },
      {
        flag: "-c-check-signed-arithmetic-overflow",
        type: "boolArg",
        default: true,
        label: "Signed arithmetic overflow",
        hint: "Check overflows in signed integer arithmetic",
      },
      {
        flag: "-c-check-signed-implicit-cast-overflow",
        type: "boolArg",
        default: true,
        label: "Signed implicit cast overflow",
        hint: "Check overflows in implicit casts to signed integer",
      },
      {
        flag: "-c-check-unsigned-arithmetic-overflow",
        type: "boolArg",
        default: false,
        label: "Unsigned arithmetic overflow",
        hint: "Check overflows in unsigned integer arithmetic",
      },
      {
        flag: "-c-check-unsigned-implicit-cast-overflow",
        type: "boolArg",
        default: true,
        label: "Unsigned implicit cast overflow",
        hint: "Check overflows in implicit casts to unsigned integer",
      },
      {
        flag: "-c-check-explicit-cast-overflow",
        type: "boolArg",
        default: false,
        label: "Explicit cast overflow",
        hint: "Check overflows in explicit casts",
      },
      {
        flag: "-c-check-overflows-with-relational",
        type: "bool",
        default: false,
        label: "Overflow w/ relational",
        hint: "More precise overflow detection (slower)",
      },
      {
        flag: "-c-signed-arithmetic-overflow-wraparound-semantics",
        type: "boolArg",
        default: true,
        label: "Signed overflow wraparound",
        hint: "Signed overflows wrap around; if false, traces are cut (undefined behavior)",
      },
      {
        flag: "-c-check-unreachable-memory",
        type: "text",
        default: "main",
        label: "Unreachable memory check",
        hint: "Check for unreachable allocated memory",
      },
      {
        flag: "-c-check-float-overflow",
        type: "boolArg",
        default: false,
        label: "Float overflow",
        hint: "Float overflows generate errors",
      },
      {
        flag: "-c-check-float-division-by-zero",
        type: "boolArg",
        default: false,
        label: "Float division by zero",
        hint: "Float /0 generates error instead of infinity",
      },
      {
        flag: "-c-check-float-invalid-operation",
        type: "boolArg",
        default: false,
        label: "Float invalid operation",
        hint: "Invalid float ops generate errors instead of silent NaN",
      },
    ],
  },
  {
    group: "C Hooks",
    options: [
      {
        flag: "-c-analysis-bugs-whitelist",
        type: "text",
        default: "",
        label: "Analysis bugs whitelist",
        hint: "Whitelist of non-terminating functions",
      },
    ],
  },
  {
    group: "Configuration",
    options: [
      {
        flag: "-hook",
        type: "select",
        default: "none",
        label: "Hook",
        hint: "Activate a hook (none = disabled)",
        choices: [
          "none",
          "gctest",
          "constant_widening_thresholds",
          "py.coverage",
          "loop_profiler",
          "logs",
          "short-logs",
          "logs-source-only",
          "py.analysis-bugs",
          "progress",
          "function_profiler",
        ],
      },
      {
        flag: "-cache",
        type: "int",
        default: 5,
        min: 1,
        max: 100,
        label: "Analysis cache size",
        hint: "Size of the analysis cache",
      },
      {
        flag: "-clean-cur-only",
        type: "bool",
        default: false,
        label: "Clean current only",
        hint: "Apply cleaners on the current environment only",
      },
      {
        flag: "-working-dir",
        type: "text",
        default: "",
        label: "Working directory",
        hint: "Working directory for resolving relative paths",
      },
    ],
  },
  {
    group: "Browser Compat",
    options: [
      {
        // analysis backend the page loads. Handled specially in
        // setOptionValue (persists to localStorage + reloads the page).
        flag: "__backend",
        type: "select",
        default: "auto",
        label: "Analysis backend",
        hint: "jsoo is lighter but has no C / cross-language analysis and relational domains use VPL instead of Apron. Changing this reloads the page.",
        choices: ["auto", "wasm", "jsoo"],
      },
    ],
  },
  {
    group: "Coverage",
    options: [
      {
        flag: "-c-show-line-coverage",
        type: "bool",
        default: false,
        label: "Show line coverage",
        hint: "Turn on per-line coverage reporting",
      },
    ],
  },
  {
    group: "Debugging",
    options: [
      {
        flag: "-debug",
        type: "text",
        default: "",
        label: "Debug channels",
        hint: "Active debug channels (syntax: c1,c2,...,cn; _ as wildcard)",
      },
      {
        flag: "-engine",
        type: "select",
        default: "automatic",
        mopsaDefault: "automatic",
        // Promoted to a first-class mode switcher in the TopBar
        // (EngineModePicker) — it reshapes the whole interface, so it doesn't
        // belong in the generic options list.
        hidden: true,
        label: "Engine",
        hint: "Selects analysis mode",
        choices: ["automatic", "interactive", "dap"],
      },
      {
        flag: "-no-warning",
        type: "bool",
        default: false,
        label: "No warnings",
        hint: "Deactivate warning messages",
      },
    ],
  },
  {
    group: "Goto",
    options: [
      {
        flag: "-goto-down",
        type: "bool",
        default: false,
        label: "Goto down iteration",
        hint: "Perform a down iteration after goto stabilization",
      },
    ],
  },
  {
    group: "Heap",
    options: [
      {
        flag: "-default-alloc-pol",
        type: "select",
        default: "range_control",
        label: "Default allocation policy",
        hint: "Allocation policy used by default",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-stub-alloc-pol",
        type: "select",
        default: "range_callstack",
        label: "Stub allocation policy",
        hint: "Allocation policy for stub resources (malloc, ...)",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-dict-alloc-pol",
        type: "select",
        default: "all",
        label: "Python dict alloc policy",
        hint: "Allocation policy for smashed dictionaries",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-list-alloc-pol",
        type: "select",
        default: "all",
        label: "Python list alloc policy",
        hint: "Allocation policy for smashed lists",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-range-alloc-pol",
        type: "select",
        default: "all",
        label: "Python range alloc policy",
        hint: "Allocation policy for range objects",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-set-alloc-pol",
        type: "select",
        default: "all",
        label: "Python set alloc policy",
        hint: "Allocation policy for smashed sets",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-slice-alloc-pol",
        type: "select",
        default: "all",
        label: "Python slice alloc policy",
        hint: "Allocation policy for slice objects",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-py-tuple-alloc-pol",
        type: "select",
        default: "all",
        label: "Python tuple alloc policy",
        hint: "Allocation policy for expanded tuples",
        choices: [
          "all",
          "range",
          "callstack",
          "range_callstack",
          "range_control",
        ],
      },
      {
        flag: "-hash-heap-address",
        type: "boolArg",
        default: false,
        label: "Hash heap addresses",
        hint: "Format heap addresses with their hash",
      },
    ],
  },
  {
    group: "Interproc",
    options: [
      {
        flag: "-mod-interproc-size",
        type: "int",
        default: 3,
        min: 1,
        max: 100,
        label: "Modular interproc cache size",
        hint: "Size of the cache in the modular interprocedural analysis",
      },
    ],
  },
  {
    group: "Interprocedural Analysis",
    options: [
      {
        flag: "-disable-var-renaming-recursive-call",
        type: "bool",
        default: false,
        label: "Disable var renaming on recursion",
        hint: "Disable renaming of local variables when detecting recursive calls",
      },
      {
        flag: "-recursion-limit",
        type: "int",
        default: 2,
        min: 0,
        max: 20,
        label: "Recursion limit",
        hint: "Limit of recursive calls",
      },
    ],
  },
  {
    group: "Loops",
    options: [
      {
        flag: "-widening-delay",
        type: "int",
        default: 0,
        min: 0,
        max: 50,
        label: "Widening delay",
        hint: "Iterations before widening",
      },
      {
        flag: "-loop-unrolling",
        type: "int",
        default: 1,
        min: 0,
        max: 10,
        label: "Unrolling iterations",
        hint: "Unrollings before join",
      },
      {
        flag: "-decreasing-iter",
        type: "int",
        default: 1,
        min: 0,
        max: 20,
        label: "Decreasing iterations",
        hint: "Decreasing iterations after stabilization",
      },
      {
        flag: "-loop-full-unrolling",
        type: "boolArg",
        default: false,
        label: "Full unrolling",
        hint: "Unroll without widening (for small loops)",
      },
      {
        flag: "-loop-full-unrolling-at",
        type: "text",
        default: "",
        label: "Full unrolling at",
        hint: "Fully unroll loop at specific location (syntax: [file.]line)",
      },
      {
        flag: "-loop-unrolling-at",
        type: "text",
        default: "",
        label: "Unrolling at",
        hint: "Unrolling iterations at specific location (syntax: [file.]line:unrolling)",
      },
      {
        flag: "-loop-decr-it",
        type: "bool",
        default: false,
        label: "Decreasing iteration",
        hint: "Enable decreasing iteration",
      },
      {
        flag: "-loop-no-cache",
        type: "bool",
        default: false,
        label: "No loop cache",
        hint: "Disable cache for loops",
      },
      {
        flag: "-py-disable-desugar-for-range",
        type: "bool",
        default: false,
        label: "Disable for-range desugar",
        hint: "Disable special desugaring on for-range-based loops",
      },
      {
        flag: "-py-disable-desugar-for-tuple",
        type: "bool",
        default: false,
        label: "Disable for-tuple desugar",
        hint: "Disable special desugaring on for...in(...) loops",
      },
    ],
  },
  {
    group: "Numeric",
    options: [
      {
        flag: "-numeric",
        type: "select",
        default: "polyhedra",
        label: "Relational domain",
        hint: "Relational numeric abstract domain (Apron. the jsoo backend ignores this and always uses VPL)",
        choices: ["polyhedra", "lineq", "octagon"],
      },
      {
        flag: "-float-rounding-mode",
        type: "select",
        default: "near",
        label: "Float rounding",
        hint: "Rounding mode for floating-point computations",
        choices: ["near", "zero", "up", "down", "rnd"],
      },
      {
        flag: "-max-set-size",
        type: "int",
        default: 10,
        min: 1,
        max: 1000,
        label: "Max set size",
        hint: "Maximum size of integer sets",
      },
      {
        flag: "-max-excluded-set-size",
        type: "int",
        default: 10,
        min: 1,
        max: 1000,
        label: "Max excluded set size",
        hint: "Maximum size of integer sets for the excluded powerset",
      },
      {
        flag: "-c-pack",
        type: "text",
        default: "",
        label: "Variable pack",
        hint: "Create a pack of variables (syntax: var,%function,%function.var,@resource)",
      },
      {
        flag: "-c-pack-only-stub-initialization",
        type: "bool",
        default: false,
        label: "Pack only stub init",
        hint: "Pack only during Mopsa's stub initialization",
      },
      {
        flag: "-c-pack-resources",
        type: "bool",
        default: false,
        label: "Pack resources",
        hint: "Pack variables based on resources (dynamically allocated blocks)",
      },
      {
        flag: "-c-pack-symargs",
        type: "bool",
        default: false,
        label: "Pack symbolic args",
        hint: "Create a user pack for variables related to symbolic arguments",
      },
      {
        flag: "-enforce-sign-constraints",
        type: "bool",
        default: false,
        label: "Enforce sign constraints",
        hint: "Enforce sign constraints of variables in the relational domain",
      },
      {
        flag: "-show-relational-def-domain",
        type: "bool",
        default: false,
        label: "Show relational def domain",
        hint: "Display the domain on which the relational abstract state is defined",
      },
    ],
  },
  {
    group: "Output",
    options: [
      {
        flag: "-format",
        type: "select",
        default: "json",
        mopsaDefault: "text",
        label: "Format",
        hint: 'Output format. Changing to "text" will break the results panel',
        choices: ["json", "text"],
      },
      {
        flag: "-lflow",
        type: "bool",
        default: false,
        label: "Last flow output",
        hint: "Display the last output",
      },
      {
        flag: "-output",
        type: "text",
        default: "",
        label: "Output file",
        hint: "Redirect output to a file",
      },
      {
        flag: "-tw",
        type: "int",
        default: 4,
        min: 1,
        max: 16,
        label: "Tab width",
        hint: "Set the tab width for output",
      },
    ],
  },
  {
    group: "Partitioning (state)",
    options: [
      {
        flag: "-state-partition-int-var",
        type: "text",
        default: "",
        label: "State partition variable",
        hint: "Variable to partition states (syntax: var or var@value1,value2,...)",
      },
      {
        flag: "-state-partition-int-var-with-full-name",
        type: "bool",
        default: false,
        label: "Full name for partition var",
        hint: "Full target names are provided to -state-partition-int-var",
      },
      {
        flag: "-keep-state-partition-forever",
        type: "bool",
        default: false,
        label: "Keep partition forever",
        hint: "Keep state partition even when variable has been removed",
      },
    ],
  },
  {
    group: "Partitioning (traces)",
    options: [
      {
        flag: "-marker",
        type: "text",
        default: "",
        label: "Trace marker",
        hint: "Enable a marker for trace partitioning (provide marker name)",
      },
      {
        flag: "-tail-markers",
        type: "int",
        default: 1,
        min: 1,
        max: 100,
        label: "Tail markers threshold",
        hint: "Number of last markers to consider when partitioning traces",
      },
    ],
  },
  {
    group: "Profiling",
    options: [
      {
        flag: "-flamegraph",
        type: "text",
        default: "",
        label: "Flamegraph path",
        hint: "Path where flame graph samples are saved",
      },
      {
        flag: "-flamegraph-resolution",
        type: "select",
        default: "ms",
        label: "Flamegraph resolution",
        hint: "Resolution of the flame graph samples",
        choices: ["s", "ms", "us", "ns"],
      },
    ],
  },
  {
    group: "Python",
    options: [
      {
        flag: "-gc",
        type: "bool",
        default: false,
        label: "Abstract GC",
        hint: "Perform abstract garbage collection after function calls",
      },
      {
        flag: "-gc-before-print",
        type: "bool",
        default: false,
        label: "GC before print",
        hint: "Perform abstract garbage collection before printing state",
      },
      {
        flag: "-gc-percent",
        type: "int",
        default: 100,
        min: 0,
        max: 100,
        label: "GC percent",
        hint: "Percent of abstract garbage collection calls",
      },
      {
        flag: "-unprecise-exn",
        type: "text",
        default: "",
        label: "Unprecise exceptions",
        hint: "Exceptions to collapse into one environment (e.g. IndexError)",
      },
    ],
  },
  {
    group: "Stubs",
    options: [
      {
        flag: "-stub-ignore-case",
        type: "text",
        default: "",
        label: "Ignore stub cases",
        hint: "List of stub cases to ignore",
      },
      {
        flag: "-stub-use-forall-loop-evaluation",
        type: "bool",
        default: false,
        label: "Forall loop evaluation",
        hint: "Use fallback evaluation of universally quantified formulas with loops",
      },
    ],
  },
  {
    group: "Unit Tests",
    options: [
      {
        flag: "-unittest",
        type: "bool",
        default: false,
        label: "Unit test mode",
        hint: "Activate unittest mode",
      },
      {
        flag: "-unittest-filter",
        type: "text",
        default: "",
        label: "Unit test filter",
        hint: "List of test functions (comma-separated) to analyze",
      },
    ],
  },
  {
    group: "Advanced",
    options: [
      {
        flag: "__raw",
        type: "text",
        default: "",
        label: "Extra flags",
        hint: "Raw CLI flags appended to analysis call",
      },
    ],
  },
];

export const SELECT_FLAGS: Set<string> = new Set(
  OPTIONS_SCHEMA.flatMap((g) =>
    g.options.filter((o) => o.type === "select").map((o) => o.flag),
  ),
);

/** Options using OCaml's Bool spec — require explicit `-flag true`/`-flag false`. */
export const BOOL_ARG_FLAGS: Set<string> = new Set(
  OPTIONS_SCHEMA.flatMap((g) =>
    g.options.filter((o) => o.type === "boolArg").map((o) => o.flag),
  ),
);

export const DEFAULT_OPTION_VALUES: Record<string, unknown> =
  Object.fromEntries(
    OPTIONS_SCHEMA.flatMap((g) => g.options.map((o) => [o.flag, o.default])),
  );

/** Mopsa's actual CLI defaults — used to skip redundant flags. Falls back to `default` when `mopsaDefault` is not set. */
export const MOPSA_DEFAULT_VALUES: Record<string, unknown> = Object.fromEntries(
  OPTIONS_SCHEMA.flatMap((g) =>
    g.options.map((o) => [
      o.flag,
      "mopsaDefault" in o ? o.mopsaDefault : o.default,
    ]),
  ),
);
