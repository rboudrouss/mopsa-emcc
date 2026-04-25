export type OptionType = 'bool' | 'int' | 'text' | 'select';

export interface OptionSpec {
  flag: string;
  type: OptionType;
  default: unknown;
  label: string;
  hint: string;
  min?: number;
  max?: number;
  choices?: string[];
}

export const OPTIONS_SCHEMA: { group: string; options: OptionSpec[] }[] = [
  {
    group: 'Alarms',
    options: [
      {
        flag: '-show-callstacks',
        type: 'bool',
        default: false,
        label: 'Show callstacks',
        hint: 'Display call stacks in alarm reports',
      },
      {
        flag: '-show-safe-checks',
        type: 'bool',
        default: true,
        label: 'Show safe checks',
        hint: 'Show safe checks in alarm reports (enabled by default in this UI)',
      },
    ],
  },
  {
    group: 'Output',
    options: [
      {
        flag: '-format',
        type: 'select',
        default: 'json',
        label: 'Format',
        hint: 'Output format. Changing to "text" will break the results panel',
        choices: ['json', 'text'],
      },
      {
        flag: '-silent',
        type: 'bool',
        default: false,
        label: 'Silent',
        hint: 'Do not return non-zero exit code on alarms',
      },
    ],
  },
  {
    group: 'C Analysis',
    options: [
      {
        flag: '-c-entry',
        type: 'text',
        default: 'main',
        label: 'Entry function',
        hint: 'Name of the analysis entry point',
      },
      {
        flag: '-without-libc',
        type: 'bool',
        default: false,
        label: 'Without libc',
        hint: 'Disable standard C library stubs',
      },
      {
        flag: '-c-symbolic-args',
        type: 'text',
        default: '',
        label: 'Symbolic args',
        hint: 'Symbolic argument count for main (syntax: min[:max])',
      },
      {
        flag: '-cell-smash',
        type: 'bool',
        default: false,
        label: 'Cell smashing',
        hint: 'On-demand smashing when expansion threshold is reached',
      },
    ],
  },
  {
    group: 'C Overflow Checks',
    options: [
      {
        flag: '-c-check-overflows-with-relational',
        type: 'bool',
        default: false,
        label: 'Overflow w/ relational',
        hint: 'More precise overflow detection (slower)',
      },
      {
        flag: '-c-check-explicit-cast-overflow',
        type: 'bool',
        default: false,
        label: 'Explicit cast overflow',
        hint: 'Check overflows in explicit casts',
      },
      {
        flag: '-c-check-unsigned-arithmetic-overflow',
        type: 'bool',
        default: false,
        label: 'Unsigned arithmetic overflow',
        hint: 'Check overflows in unsigned integer arithmetic',
      },
      {
        flag: '-c-check-float-overflow',
        type: 'bool',
        default: false,
        label: 'Float overflow',
        hint: 'Float overflows generate errors',
      },
      {
        flag: '-c-check-float-division-by-zero',
        type: 'bool',
        default: false,
        label: 'Float division by zero',
        hint: 'Float /0 generates error instead of infinity',
      },
      {
        flag: '-c-check-float-invalid-operation',
        type: 'bool',
        default: false,
        label: 'Float invalid operation',
        hint: 'Invalid float ops generate errors instead of silent NaN',
      },
    ],
  },
  {
    group: 'Loops',
    options: [
      {
        flag: '-widening-delay',
        type: 'int',
        default: 0,
        min: 0,
        max: 50,
        label: 'Widening delay',
        hint: 'Iterations before widening',
      },
      {
        flag: '-loop-unrolling',
        type: 'int',
        default: 1,
        min: 0,
        max: 10,
        label: 'Unrolling iterations',
        hint: 'Unrollings before join',
      },
      {
        flag: '-decreasing-iter',
        type: 'int',
        default: 1,
        min: 0,
        max: 20,
        label: 'Decreasing iterations',
        hint: 'Decreasing iterations after stabilization',
      },
      {
        flag: '-loop-full-unrolling',
        type: 'bool',
        default: false,
        label: 'Full unrolling',
        hint: 'Unroll without widening (for small loops)',
      },
      {
        flag: '-loop-no-cache',
        type: 'bool',
        default: false,
        label: 'No loop cache',
        hint: 'Disable cache for loops',
      },
    ],
  },
  {
    group: 'Numeric',
    options: [
      {
        flag: '-numeric',
        type: 'select',
        default: 'polyhedra',
        label: 'Relational domain',
        hint: 'Relational numeric abstract domain',
        choices: ['polyhedra', 'lineq', 'octagon'],
      },
      {
        flag: '-float-rounding-mode',
        type: 'select',
        default: 'near',
        label: 'Float rounding',
        hint: 'Rounding mode for floating-point computations',
        choices: ['near', 'zero', 'up', 'down', 'rnd'],
      },
      {
        flag: '-max-set-size',
        type: 'int',
        default: 10,
        min: 1,
        max: 1000,
        label: 'Max set size',
        hint: 'Maximum size of integer sets',
      },
    ],
  },
  {
    group: 'Interprocedural',
    options: [
      {
        flag: '-recursion-limit',
        type: 'int',
        default: 2,
        min: 0,
        max: 20,
        label: 'Recursion limit',
        hint: 'Limit of recursive calls',
      },
    ],
  },
  {
    group: 'Advanced',
    options: [
      {
        flag: '__raw',
        type: 'text',
        default: '',
        label: 'Extra flags',
        hint: 'Raw CLI flags appended to analysis call',
      },
    ],
  },
];

export const SELECT_FLAGS: Set<string> = new Set(
  OPTIONS_SCHEMA.flatMap((g) => g.options.filter((o) => o.type === 'select').map((o) => o.flag))
);

export const DEFAULT_OPTION_VALUES: Record<string, unknown> = Object.fromEntries(
  OPTIONS_SCHEMA.flatMap((g) => g.options.map((o) => [o.flag, o.default]))
);
