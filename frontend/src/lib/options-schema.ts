export type OptionType = 'bool' | 'int' | 'text';

export interface OptionSpec {
  flag: string;
  type: OptionType;
  default: unknown;
  label: string;
  hint: string;
  min?: number;
  max?: number;
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
        flag: '-loop-full-unrolling',
        type: 'bool',
        default: false,
        label: 'Full unrolling',
        hint: 'Unroll without widening (for small loops)',
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
        flag: '-c-check-overflows-with-relational',
        type: 'bool',
        default: false,
        label: 'Overflow w/ relational',
        hint: 'More precise overflow detection (slower)',
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

export const DEFAULT_OPTION_VALUES: Record<string, unknown> = Object.fromEntries(
  OPTIONS_SCHEMA.flatMap((g) => g.options.map((o) => [o.flag, o.default]))
);
