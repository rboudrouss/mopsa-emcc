import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/**
 * Shared xterm.js wrapper used for every ANSI surface in the app:
 *   - RawOutput          (read-only, batch analysis text)
 *   - InteractiveTerminal (read-write REPL — `-engine=interactive`)
 *   - DapConsole         (read-only DAP `output` events)
 *
 * Mopsa emits 256-color SGR sequences (\027[1;38;5;Nm); xterm renders the
 * full palette natively, which is why we render through it instead of the
 * old hand-rolled ansiToSpans (16-color only).
 */

export interface AnsiTerminalHandle {
  /** Append data (ANSI included) at the cursor. */
  write: (data: string | Uint8Array) => void;
  /** Wipe the screen and scrollback. */
  reset: () => void;
  /** Recompute size to fill the container. */
  fit: () => void;
  /** Escape hatch to the underlying xterm instance. */
  term: () => Terminal | null;
}

interface AnsiTerminalProps {
  /** When true, the terminal accepts no keyboard input. */
  readOnly?: boolean;
  /** Called with raw keystroke data when not read-only. */
  onData?: (data: string) => void;
  className?: string;
  style?: React.CSSProperties;
  fontSize?: number;
}

/** Build an xterm theme from the app's CSS custom properties. */
function readTheme(): ITheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--bg-elevated", "#1e2433"),
    foreground: v("--text-secondary", "#8891a8"),
    cursor: v("--text-primary", "#e8eaf0"),
    cursorAccent: v("--bg-elevated", "#1e2433"),
    selectionBackground: v("--bg-hover", "#252d42"),
  };
}

export const AnsiTerminal = forwardRef<AnsiTerminalHandle, AnsiTerminalProps>(
  function AnsiTerminal(
    { readOnly = false, onData, className, style, fontSize = 12 },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    // Keep onData fresh without re-creating the terminal.
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    // Fitting xterm to a 0×0 container (e.g. inside a closed <details>, or
    // before layout) makes its renderer throw on bad dimensions. Only fit when
    // the element actually has a size.
    const safeFit = () => {
      const el = containerRef.current;
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
        try {
          fitRef.current?.fit();
        } catch {
          /* detached mid-resize */
        }
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        write: (data) => termRef.current?.write(data),
        reset: () => termRef.current?.reset(),
        fit: safeFit,
        term: () => termRef.current,
      }),
      [],
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const term = new Terminal({
        convertEol: true,
        disableStdin: readOnly,
        cursorBlink: !readOnly,
        scrollback: 5000,
        fontSize,
        fontFamily: "'JetBrains Mono', monospace",
        theme: readTheme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);

      termRef.current = term;
      fitRef.current = fit;

      // Defer term.open() until the container has a non-zero size AND the
      // next animation frame. Opening/fitting xterm on a 0×0 element (flex
      // layouts, collapsed panes, before first paint) makes its renderer
      // throw on undefined dimensions; and React StrictMode's throwaway
      // mount/unmount in dev would otherwise leave an orphaned xterm render
      // frame firing after dispose. The rAF is cancelled on cleanup, so the
      // throwaway mount never actually opens. Writes before open() are
      // buffered by xterm and render once it opens.
      let opened = false;
      let disposed = false;
      let rafId = 0;
      const openAndFit = () => {
        if (disposed) return;
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
        if (!opened) {
          term.open(el);
          opened = true;
        }
        try {
          fit.fit();
        } catch {
          /* detached mid-resize */
        }
      };
      rafId = requestAnimationFrame(openAndFit);

      const dataDisposable = term.onData((d) => onDataRef.current?.(d));

      const ro = new ResizeObserver(() => openAndFit());
      ro.observe(el);

      // Re-theme when the app toggles html.dark / html.light. Only once the
      // terminal is opened — setting the theme before open() touches the
      // (absent) render service and throws.
      const themeObserver = new MutationObserver(() => {
        if (!opened) return;
        try {
          term.options.theme = readTheme();
        } catch {
          /* renderer not ready */
        }
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        dataDisposable.dispose();
        ro.disconnect();
        themeObserver.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
      // readOnly/fontSize are construction-time; remount on change.
    }, [readOnly, fontSize]);

    return <div ref={containerRef} className={className} style={style} />;
  },
);
