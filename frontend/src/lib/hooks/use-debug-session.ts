import { useCallback, useEffect, useRef } from "react";
import { DapClient } from "../dap/DapClient";
import type { DapVariable, OutputBody, StoppedBody } from "../dap/types";
import type { CheckItem } from "../types";
import { computeAnalysisArgs } from "../analysis-args";
import { useAppStore } from "../store";
import { useDebugStore } from "../store-debug";
import { checkBackendSupport } from "./use-run";

/**
 * Drives a `-engine=dap` session: starts the worker run, wires a DapClient to
 * its stdin/stdout, runs the initialize→breakpoints→launch handshake, and
 * keeps the debug store in sync with stopped/output/terminated events.
 *
 * Returns the control surface used by the debug toolbar / panels.
 */
export function useDebugSession() {
  const sessionRef = useRef<MopsaSessionHandle | null>(null);
  const clientRef = useRef<DapClient | null>(null);
  const sessionNonce = useAppStore((s) => s.sessionNonce);
  const lastStartedRef = useRef(-1);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const d = useDebugStore.getState();
    try {
      const st = await client.stackTrace();
      const frames = st.stackFrames ?? [];
      const top = frames[0];
      const loc = top?.source?.path
        ? { path: top.source.path, line: top.line }
        : null;
      d.setStopped(frames, loc);
      // Mopsa only exposes scopes for the current (top) action.
      const sc = await client.scopes(top ? top.id : 0);
      d.setScopes(sc.scopes ?? []);
      for (const scope of sc.scopes ?? []) {
        try {
          const v = await client.variables(scope.variablesReference);
          d.setVariables(scope.variablesReference, v.variables ?? []);
        } catch {
          /* scope without children */
        }
      }
    } catch {
      /* stackTrace can fail if the session ended meanwhile */
    }
  }, []);

  const kill = useCallback(() => {
    clientRef.current?.dispose();
    clientRef.current = null;
    sessionRef.current?.kill();
    sessionRef.current = null;
  }, []);

  const start = useCallback(async () => {
    kill();
    const d = useDebugStore.getState();
    d.resetDebug();

    // Auto-start paths bypass useRun, so repeat the backend gate here; the
    // banner in the right panel explains the details.
    if (checkBackendSupport()) {
      d.setError("Not supported by the selected backend.");
      return;
    }
    d.setStatus("initializing");

    const args = computeAnalysisArgs();
    if (!args) {
      d.setError("Nothing to analyse (no entry point).");
      return;
    }

    let session: MopsaSessionHandle;
    try {
      session = mopsaJs.startSession("dap", args);
    } catch (e) {
      d.setError(String((e as Error).message ?? e));
      return;
    }
    sessionRef.current = session;
    const client = new DapClient((frame) => session.sendInput(frame));
    clientRef.current = client;

    session.onData((bytes) => client.receive(bytes));
    session.onEnd(() => {
      client.dispose();
      const s = useDebugStore.getState();
      if (s.status !== "error") s.setStatus("terminated");
    });
    session.onError((msg) => useDebugStore.getState().setError(msg));

    client.on("stopped", (body) => {
      void refresh();
      void (body as StoppedBody);
    });
    client.on("terminated", () => useDebugStore.getState().setStatus("terminated"));
    client.on("output", (body) => {
      const b = body as OutputBody;
      const d = b?.data as { kind?: string; alarms?: CheckItem[] } | undefined;
      // Alarm output events carry the full alarm list in data.alarms (same
      // shape as batch checks); surface them in the Alarms panel.
      if (d?.kind === "alarms" && Array.isArray(d.alarms)) {
        // Strip ANSI from messages so both the Alarms panel and the editor
        // hover render cleanly.
        const cleaned = d.alarms.map((a) => ({
          ...a,
          messages: a.messages?.replace(/\x1b\[[0-9;]*m/g, "") ?? a.messages,
        }));
        useDebugStore.getState().addAlarms(cleaned);
      }
      if (typeof b?.output === "string" && b.output.length > 0)
        useDebugStore.getState().appendConsole(b.output);
    });

    try {
      await client.initialize();
      const bps = useDebugStore.getState().breakpoints;
      for (const path of Object.keys(bps)) {
        if (bps[path].length > 0) await client.setBreakpoints(path, bps[path]);
      }
      await client.setExceptionBreakpoints([]);
      await client.launch();
      // The engine emits `stopped` at the entry point; the listener refreshes.
    } catch (e) {
      useDebugStore.getState().setError(String((e as Error).message ?? e));
    }
  }, [kill, refresh]);

  // (Re)start whenever the user hits Run (sessionNonce bumps).
  useEffect(() => {
    if (sessionNonce === 0 || sessionNonce === lastStartedRef.current) return;
    lastStartedRef.current = sessionNonce;
    void start();
  }, [sessionNonce, start]);

  // Kill on unmount (e.g. engine switched away).
  useEffect(() => kill, [kill]);

  // Note: stale DAP alarms (and the batch results) are cleared centrally by the
  // store's edit mutations (setCode / setOptionValue / setConfigText / …), so
  // navigation between files — which changes `code`/`configText` directly —
  // does NOT wipe them.

  const resume = (fn: () => Promise<unknown> | undefined) => {
    useDebugStore.getState().setStatus("running");
    fn()?.catch(() => {});
  };

  return {
    cont: () => resume(() => clientRef.current?.continue_()),
    next: () => resume(() => clientRef.current?.next()),
    stepIn: () => resume(() => clientRef.current?.stepIn()),
    stepOut: () => resume(() => clientRef.current?.stepOut()),
    restart: () => clientRef.current?.restart().catch(() => {}),
    disconnect: () => {
      clientRef.current
        ?.disconnect()
        .catch(() => {})
        .finally(kill);
    },
    kill,
    selectFrame: (id: number) => useDebugStore.getState().setCurrentFrame(id),
    loadVariables: async (vref: number) => {
      const v = await clientRef.current?.variables(vref).catch(() => undefined);
      if (v) useDebugStore.getState().setVariables(vref, v.variables ?? []);
    },
    evaluateWatch: async (expr: string): Promise<string> => {
      const client = clientRef.current;
      if (!client) return "(no session)";
      const frameId = useDebugStore.getState().currentFrameId ?? 0;
      const r = await client.evaluate(expr, frameId).catch(() => undefined);
      if (!r) return "(error)";
      if (!r.variablesReference) return r.result ?? "(no value)";
      // Mopsa wraps the value under grouping nodes (the abstract domain, e.g.
      // "int-itv ∪ …") whose own value is empty; descend through those to the
      // leaves so the watch shows the variable's value, not the domain name.
      const collect = async (vref: number, depth: number): Promise<DapVariable[]> => {
        if (vref <= 0 || depth > 5) return [];
        const v = await client.variables(vref).catch(() => undefined);
        const out: DapVariable[] = [];
        for (const x of v?.variables ?? []) {
          if (x.value !== "" || x.variablesReference <= 0) out.push(x);
          else out.push(...(await collect(x.variablesReference, depth + 1)));
        }
        return out;
      };
      const leaves = await collect(r.variablesReference, 0);
      if (leaves.length === 0) return "(empty)";
      // Single variable: the panel already shows the name, so just the value.
      // Multiple: label each (the engine may reorder them vs. what was typed).
      if (leaves.length === 1) return leaves[0].value || leaves[0].name || "(empty)";
      return leaves.map((x) => (x.name ? `${x.name}=${x.value}` : x.value)).join(", ");
    },
  };
}

export type DebugControls = ReturnType<typeof useDebugSession>;
