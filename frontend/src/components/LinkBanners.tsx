import { useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { KEPT_KEY, leaving } from "@/lib/keep";
import { useLinkStatus } from "@/lib/open-link";
import { embedded, temporary } from "@/lib/session";
import { useAppStore } from "@/lib/store";

// (a temporary session kept, what it told the page loaded again)
let keptMessage: string | null = null;
try {
  keptMessage = sessionStorage.getItem(KEPT_KEY);
  sessionStorage.removeItem(KEPT_KEY);
} catch {
  /* no sessionStorage */
}

/**
 * What the page's link does: its folders being fetched, what went wrong, a
 * folder renamed; a temporary session kept (lib/keep.ts), told once the
 * page is loaded again without the link. Leaving a temporary session after
 * a change asks first (the top bar says it is one: TemporaryBadge).
 */
export function LinkBanners({ linkOpened }: { linkOpened: boolean }) {
  const { progress, error, notice, dismiss } = useLinkStatus();
  const [kept, setKept] = useState(keptMessage);
  const edited = useRef(false);

  // (the session changed once the link's files are in)
  useEffect(() => {
    if (!temporary || embedded || !linkOpened) return;
    return useAppStore.subscribe((s, prev) => {
      if (s.code !== prev.code || s.fileTree !== prev.fileTree || s.configText !== prev.configText)
        edited.current = true;
    });
  }, [linkOpened]);
  useEffect(() => {
    if (!temporary || embedded) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (edited.current && !leaving) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      {kept && <Banner close={() => setKept(null)}>{kept}</Banner>}
      {(progress || error || notice) && (
        <Banner warning={!progress} close={progress ? undefined : dismiss}>
          {progress ? `${progress}…` : (error ?? notice)}
        </Banner>
      )}
    </div>
  );
}

function Banner({
  children,
  warning,
  close,
}: {
  children: React.ReactNode;
  warning?: boolean;
  close?: () => void;
}) {
  return (
    <div className={`banner${warning ? " warning" : ""}`} role="status">
      <span>{children}</span>
      {close && (
        <button className="close" onClick={close} title="Dismiss" aria-label="Dismiss">
          <XIcon size={13} />
        </button>
      )}
    </div>
  );
}
