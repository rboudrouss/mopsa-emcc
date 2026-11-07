import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

/**
 * Header of a foldable section of the results: a chevron and an uppercase
 * title, with optional controls on the right (shown when open, unless
 * `alwaysShowActions`).
 */
export function FoldHeader({
  title,
  open,
  onToggle,
  hint,
  actions,
  alwaysShowActions = false,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  hint?: string;
  actions?: React.ReactNode;
  alwaysShowActions?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <button onClick={onToggle} title={hint} style={headerButton}>
        <ChevronDownIcon
          size={12}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 120ms",
          }}
        />
        {title}
      </button>
      <div style={{ flex: 1 }} />
      {(open || alwaysShowActions) && actions}
    </div>
  );
}

/** Open state of a fold, remembered across reloads under `key`. */
export function useFold(key: string, initial: boolean): [boolean, () => void] {
  const storageKey = `mopsa-fold-${key}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const toggle = () => {
    try {
      localStorage.setItem(storageKey, open ? "0" : "1");
    } catch {
      /* no localStorage */
    }
    setOpen(!open);
  };
  return [open, toggle];
}

const headerButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: 0,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
