import { useState } from "react";
import { CheckIcon, Share2Icon } from "lucide-react";
import { createShareLink } from "@/lib/share";

/**
 * Copies a permalink of the active workspace (files, config, options) to
 * the clipboard. Everything travels in the URL fragment: no server.
 */
export function ShareButton() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const share = async () => {
    try {
      const link = await createShareLink();
      if (!link) throw new Error("nothing to share");
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      onClick={share}
      title={
        state === "copied"
          ? "Link copied to the clipboard"
          : state === "error"
            ? "Could not copy the link"
            : "Copy a link to this workspace (files, config, options)"
      }
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        background: "none",
        border: `1px solid ${state === "copied" ? "#4ade80" : "var(--border)"}`,
        borderRadius: 6,
        cursor: "pointer",
        color:
          state === "copied"
            ? "#4ade80"
            : state === "error"
              ? "#f87171"
              : "var(--text-secondary)",
        flexShrink: 0,
        transition: "color 120ms, border-color 120ms",
      }}
    >
      {state === "copied" ? <CheckIcon size={15} /> : <Share2Icon size={15} />}
    </button>
  );
}
