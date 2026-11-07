import { useCallback, useEffect, useRef, useState } from "react";
import { AnsiTerminal, type AnsiTerminalHandle } from "@/components/ui/AnsiTerminal";
import { computeAnalysisArgs, computeInputSignature } from "@/lib/analysis-args";
import { useAppStore } from "@/lib/store";
import { checkBackendSupport } from "@/lib/hooks/use-run";

type Status = "idle" | "running" | "ended" | "error";

/**
 * Live REPL terminal: a Mopsa run with `-engine=interactive`, (re)started
 * each time `startNonce` changes (0: not started).
 *
 * Mopsa's stdin is a non-tty char device in WASM, so `tcgetattr` fails and the
 * engine falls back to line-buffered `Stdlib.read_line` with no echo. We
 * therefore do local echo + minimal line editing here and ship the whole line
 * (plus "\n") to stdin on Enter. Engine output (prompt, results) streams back
 * as raw bytes and is written straight to xterm, which renders the ANSI.
 */
export function InteractiveTerminal({
  startNonce,
  onRestart,
}: {
  startNonce: number;
  onRestart: () => void;
}) {
  const termRef = useRef<AnsiTerminalHandle>(null);
  const sessionRef = useRef<MopsaSessionHandle | null>(null);
  const lineRef = useRef<string>("");
  const [status, setStatus] = useState<Status>("idle");
  // The session analyzes the code of its start: flag later edits.
  const [startedSig, setStartedSig] = useState<string | null>(null);
  const currentSig = useAppStore(() =>
    status === "running" ? computeInputSignature() : null,
  );
  const stale = status === "running" && startedSig !== null && startedSig !== currentSig;

  const lastStartedRef = useRef<number>(0);

  const kill = useCallback(() => {
    sessionRef.current?.kill();
    sessionRef.current = null;
  }, []);

  // (Re)start the session whenever startNonce bumps.
  useEffect(() => {
    if (startNonce === 0 || startNonce === lastStartedRef.current) return;
    lastStartedRef.current = startNonce;

    kill();
    lineRef.current = "";
    const term = termRef.current;
    term?.reset();

    // The backend gate of useRun, for sessions. The banner explains; keep
    // the terminal line short.
    if (checkBackendSupport()) {
      term?.write(
        "\x1b[33mNot supported by the selected backend (see the message above).\x1b[0m\r\n",
      );
      setStatus("idle");
      return;
    }

    // Text output in a terminal: the results panel's -format=json would
    // print the final report as JSON.
    const args = computeAnalysisArgs()?.filter((a) => !a.startsWith("-format"));
    if (!args) {
      term?.write("\x1b[31mNothing to analyse (no entry point).\x1b[0m\r\n");
      setStatus("error");
      return;
    }

    try {
      // Its own worker: the batch analyses of the shared one keep running
      // (auto-run) while the session waits for input.
      const session = mopsaJs.startBackgroundSession("interactive", args);
      sessionRef.current = session;
      setStartedSig(computeInputSignature());
      setStatus("running");
      session.onData((bytes) => termRef.current?.write(bytes));
      session.onEnd(() => {
        setStatus("ended");
        termRef.current?.write("\r\n\x1b[2m[session ended]\x1b[0m\r\n");
        sessionRef.current = null;
      });
      session.onError((msg) => {
        setStatus("error");
        termRef.current?.write("\r\n\x1b[31m" + msg + "\x1b[0m\r\n");
        sessionRef.current = null;
      });
    } catch (e) {
      setStatus("error");
      term?.write("\x1b[31m" + String((e as Error).message ?? e) + "\x1b[0m\r\n");
    }
  }, [startNonce, kill]);

  // Kill the session if the component unmounts. Forgetting the started
  // nonce lets a remount (React's StrictMode does one) start it again.
  useEffect(
    () => () => {
      kill();
      lastStartedRef.current = 0;
    },
    [kill],
  );

  // Local line editing: echo printable keys, handle Enter/Backspace/Ctrl-C/D.
  const handleData = useCallback(
    (data: string) => {
      const session = sessionRef.current;
      const term = termRef.current;
      if (!session || !term) return;

      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") {
          term.write("\r\n");
          session.sendInput(lineRef.current + "\n");
          lineRef.current = "";
        } else if (ch === "\x7f" || ch === "\b") {
          if (lineRef.current.length > 0) {
            lineRef.current = lineRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (ch === "\x03") {
          // Ctrl-C → terminate the run.
          term.write("^C\r\n");
          kill();
          setStatus("ended");
        } else if (ch === "\x04") {
          // Ctrl-D → end of input.
          session.sendEof();
        } else if (code >= 0x20) {
          lineRef.current += ch;
          term.write(ch);
        }
        // Other control sequences (arrows, etc.) are ignored in line mode.
      }
    },
    [kill],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        <span style={{ textTransform: "none", letterSpacing: 0 }}>
          {status === "running"
            ? "● live, type 'help' for the commands"
            : status === "ended"
              ? "○ ended"
              : status === "error"
                ? "✕ error"
                : "not started"}
        </span>
        {stale && (
          <span
            style={{ textTransform: "none", letterSpacing: 0, color: "#f5b544" }}
            title="The session analyzes the code as it was when it started"
          >
            code changed
          </span>
        )}
        <div style={{ flex: 1 }} />
        {status === "running" && (
          <button
            onClick={() => {
              kill();
              setStatus("ended");
            }}
            style={termButton}
          >
            Kill
          </button>
        )}
        <button
          onClick={onRestart}
          title="Start a new session on the current code"
          style={termButton}
        >
          {status === "idle" ? "Start" : "Restart"}
        </button>
      </div>
      <AnsiTerminal
        ref={termRef}
        onData={handleData}
        style={{
          flex: 1,
          minHeight: 0,
          padding: "8px 10px",
          background: "var(--bg-elevated)",
          borderRadius: 6,
        }}
      />
    </div>
  );
}

const termButton: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  cursor: "pointer",
  color: "var(--text-secondary)",
  fontSize: 11,
  padding: "2px 8px",
  textTransform: "none",
  letterSpacing: 0,
};
