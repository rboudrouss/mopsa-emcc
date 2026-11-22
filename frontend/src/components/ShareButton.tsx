import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Share2Icon } from "lucide-react";
import { ShareDialog } from "@/components/ShareDialog";

/**
 * Opens the Share dialog: a link to these files, config and options, or the
 * HTML that embeds the page in another site. Everything travels in the URL:
 * no server.
 */
export function ShareButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        title="A link to these files, or the HTML that embeds them"
        aria-label="Share"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          background: open ? "var(--bg-elevated)" : "none",
          border: "1px solid var(--border)",
          borderRadius: 6,
          cursor: "pointer",
          color: "var(--text-secondary)",
          flexShrink: 0,
          transition: "color 120ms, border-color 120ms",
        }}
      >
        <Share2Icon size={15} />
      </button>
      {open && createPortal(<ShareDialog close={close} />, document.body)}
    </>
  );
}
