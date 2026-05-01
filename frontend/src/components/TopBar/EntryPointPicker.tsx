import { ChevronDownIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getAllFilePaths } from "@/lib/tree";

export function EntryPointPicker() {
  const lang = useAppStore((s) => s.lang);
  const crossLanguage = useAppStore((s) => s.crossLanguage);
  const fileTree = useAppStore((s) => s.fileTree);
  const pyEntryPoint = useAppStore((s) => s.pyEntryPoint);
  const setPyEntryPoint = useAppStore((s) => s.setPyEntryPoint);
  const activeFile = useAppStore((s) => s.activeFile);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!crossLanguage && lang !== "python") return null;

  const allPyFiles = getAllFilePaths(fileTree)
    .filter(({ path }) => path.endsWith(".py"))
    .map(({ path }) => "/" + path);

  // Resolve what the "auto" entry point would be
  const activeCodePath = mopsaJs.getCodeFilePath()[1];
  const activeIsPy = activeCodePath.endsWith(".py");

  const resolvedEntry = pyEntryPoint ?? (activeIsPy ? activeCodePath : null);
  const isAuto = pyEntryPoint === null;
  const label = isAuto
    ? `auto: ${resolvedEntry ? resolvedEntry.split("/").pop() : "—"}`
    : (resolvedEntry?.split("/").pop() ?? "—");

  const showWarning = crossLanguage && !activeIsPy && pyEntryPoint === null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title="Choose Python entry point"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: showWarning
            ? "rgba(245,90,66,0.12)"
            : "var(--bg-elevated)",
          color: showWarning ? "#f55a42" : "var(--text-secondary)",
          border: `1px solid ${showWarning ? "#f55a42" : "var(--border)"}`,
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: "nowrap",
          transition: "background 150ms",
        }}
      >
        {showWarning ? "⚠ " : "⏵ "}
        {showWarning ? "no .py entry" : label}
        <ChevronDownIcon size={11} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 100,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              minWidth: 180,
              overflow: "hidden",
            }}
          >
            {/* Auto option */}
            <DropdownItem
              label={`auto${activeIsPy ? `: ${activeCodePath.split("/").pop()}` : ""}`}
              selected={isAuto}
              onClick={() => {
                setPyEntryPoint(null);
                setOpen(false);
              }}
              muted={!activeIsPy}
            />

            {allPyFiles.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  margin: "2px 0",
                }}
              />
            )}

            {allPyFiles.map((p) => (
              <DropdownItem
                key={p}
                label={p.split("/").pop()!}
                sublabel={p}
                selected={pyEntryPoint === p}
                onClick={() => {
                  setPyEntryPoint(p);
                  setOpen(false);
                }}
              />
            ))}

            {allPyFiles.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                No .py files in tree
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DropdownItem({
  label,
  sublabel,
  selected,
  onClick,
  muted,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "6px 12px",
        background: selected ? "var(--bg-elevated)" : "transparent",
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
        border: "none",
        textAlign: "left",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: selected ? 600 : 400,
      }}
    >
      {selected && <span style={{ marginRight: 6 }}>✓</span>}
      {label}
      {sublabel && sublabel !== "/" + label && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
          {sublabel}
        </div>
      )}
    </button>
  );
}
