interface BottomSheetProps {
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Slide-up sheet used by the mobile bottom dock (Files / Domains / Options).
 * Dismissed by tapping the dimmed backdrop.
 */
export function BottomSheet({ onClose, children }: BottomSheetProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(6, 8, 12, 0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-end",
        animation: "mopsa-fade-in 150ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "75dvh",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "mopsa-sheet-up 220ms ease-out",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 0 4px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--border)",
            }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
