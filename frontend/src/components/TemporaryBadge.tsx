import { useEffect, useRef, useState } from "react";
import { HourglassIcon } from "lucide-react";
import { keepAndLeave } from "@/lib/keep";
import { embedded, temporary } from "@/lib/session";

/**
 * The top bar's sign of a temporary session (?temp): clicked, what it means
 * and a button that keeps its files (lib/keep.ts). Not in an embed.
 */
export function TemporaryBadge({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) =>
      root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!temporary || embedded) return null;
  return (
    <div ref={root} className="temporary-badge">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Nothing is saved in this browser"
      >
        <HourglassIcon size={13} /> {compact ? "Temporary" : "Temporary session"}
      </button>
      {open && (
        <div className="temporary-popover" role="dialog" aria-label="Temporary session">
          <p>
            Nothing is saved in this browser, and closing the page loses the changes. Your own
            files are left as they are.
          </p>
          <button
            className="keep"
            onClick={keepAndLeave}
            title="Copy these files into your workspace, and leave the session"
          >
            Keep these files
          </button>
        </div>
      )}
    </div>
  );
}
