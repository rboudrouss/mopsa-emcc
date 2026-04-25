import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

interface DomainNodeProps {
  node: unknown;
  depth?: number;
  label?: string;
}

const DOMAIN_PREFIX_COLORS: Record<string, string> = {
  'c.':         '#60a5fa',
  'python.':    '#fbbf24',
  'universal.': '#a78bfa',
  'stubs.':     '#8891a8',
};

function getLeafColor(value: string): string {
  for (const [prefix, color] of Object.entries(DOMAIN_PREFIX_COLORS)) {
    if (value.startsWith(prefix)) return color;
  }
  return 'var(--text-secondary)';
}

const CONTAINER_KEYS = ['switch', 'compose', 'product', 'nonrel', 'union', 'reductions'];

const CONTAINER_COLORS: Record<string, string> = {
  switch:     '#60a5fa',
  compose:    '#a78bfa',
  product:    '#4ade80',
  nonrel:     '#fbbf24',
  union:      '#f87171',
  reductions: '#f5b544',
  semantic:   '#8891a8',
};

const INDENT = 8;

export function DomainNode({ node, depth = 0, label }: DomainNodeProps) {
  const [open, setOpen] = useState(depth < 2);

  const indent = depth * INDENT;

  // ── String leaf ─────────────────────────────────────────────────────────────
  if (typeof node === 'string') {
    return (
      <div
        style={{
          paddingLeft: indent + 8,
          paddingTop: 2,
          paddingBottom: 2,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: getLeafColor(node),
          wordBreak: 'break-all',
        }}
      >
        {label && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{label}:</span>}
        {node}
      </div>
    );
  }

  if (typeof node !== 'object' || node === null) return null;

  // ── Array: render each element in order ────────────────────────────────────
  if (Array.isArray(node)) {
    return (
      <div>
        {node.map((item, i) => (
          <DomainNode key={i} node={item} depth={depth} />
        ))}
      </div>
    );
  }

  const obj = node as Record<string, unknown>;

  // ── { semantic, switch } compound node ─────────────────────────────────────
  // A semantic group: has a "semantic" label + optional "switch" children
  if ('semantic' in obj) {
    const semanticLabel = String(obj.semantic);
    const switchContent = obj.switch;
    const color = CONTAINER_COLORS['semantic'];

    return (
      <div style={{ paddingLeft: indent }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {open ? (
            <ChevronDownIcon size={12} color="var(--text-muted)" />
          ) : (
            <ChevronRightIcon size={12} color="var(--text-muted)" />
          )}
          {label && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>
              {label}:
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            semantic
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', marginLeft: 4 }}>
            {semanticLabel}
          </span>
        </button>
        {open && switchContent !== undefined && (
          <DomainNode node={switchContent} depth={depth + 1} />
        )}
      </div>
    );
  }

  // ── Known container key ─────────────────────────────────────────────────────
  const containerKey = Object.keys(obj).find((k) => CONTAINER_KEYS.includes(k));
  if (containerKey) {
    const children = obj[containerKey];
    const color = CONTAINER_COLORS[containerKey] ?? 'var(--text-secondary)';
    return (
      <div style={{ paddingLeft: indent }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {open ? (
            <ChevronDownIcon size={12} color="var(--text-muted)" />
          ) : (
            <ChevronRightIcon size={12} color="var(--text-muted)" />
          )}
          {label && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>
              {label}:
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {containerKey}
          </span>
        </button>
        {open && <DomainNode node={children} depth={depth + 1} />}
      </div>
    );
  }

  // ── Generic object: render each key-value pair ──────────────────────────────
  return (
    <div style={{ paddingLeft: indent }}>
      {Object.entries(obj).map(([key, value]) => (
        <DomainNode key={key} node={value} depth={depth} label={key} />
      ))}
    </div>
  );
}
