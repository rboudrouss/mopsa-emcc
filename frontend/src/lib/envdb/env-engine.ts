import { DapClient } from "../dap/DapClient";
import { computeAnalysisArgs, computeInputSignature } from "../analysis-args";
import { getActiveAnalysisMode } from "../tree";
import { unsupportedReason } from "../backend";
import { useAppStore } from "../store";

/**
 * Environment-database engine: the abstract states Mopsa computed at every
 * line, for the editor hover, the States panel and the coverage gutter.
 *
 * Maintains ONE long-lived background `-engine=dap` session on a dedicated
 * worker (mopsaJs.startBackgroundSession), independent from whatever the
 * user runs in the UI (scan / interactive). The session is driven to
 * completion (initialize → launch → continue); once the analysis
 * terminates, Mopsa keeps serving its environment database (envdb), which by
 * then covers every line the analysis reached, through the custom requests
 * `environment` (hover), `environments` (per call stack) and `envdbLines`.
 *
 * Lifecycle: the session starts lazily on the first use (a hover, or a
 * consumer calling `start`), then stays warm. Any store change that alters
 * the analysis inputs (code, files, options, config) restarts it after a
 * debounce, so states reflect fresh code.
 */

export type HoverEnvResult =
  | { kind: "env"; env: unknown }
  | { kind: "analyzing" }
  | { kind: "unavailable" };

export type EnvPhase = "idle" | "starting" | "analyzing" | "ready" | "error";

/** What the `environments` request prints for each state. */
export type EnvScope = "line" | "function" | "all" | "state";

export interface RangePos {
  file: string;
  line: number;
  column: number;
}

export interface EnvCallsite {
  function: string;
  range: { start?: RangePos; end?: RangePos };
}

/** One state of the envdb: the state at a line under one call stack. */
export interface EnvContext {
  /** Innermost call first. */
  callstack: EnvCallsite[];
  bottom: boolean;
  /** Mopsa print object as JSON; null when bottom. */
  env: unknown;
}

export interface EnvironmentsBody {
  file: string;
  line: number;
  contexts: EnvContext[];
}

export interface EnvdbLinesBody {
  files: Record<string, { reached: number[]; unreachable: number[] }>;
}

export type EnvQueryResult<T> =
  | { kind: "ok"; body: T }
  | { kind: "analyzing" }
  | { kind: "unavailable"; reason: string };

export interface EnvSnapshot {
  phase: EnvPhase;
  /** Bumped on every (re)start: results of older generations are stale. */
  generation: number;
}

// Debounce between an edit and the background re-analysis. Slightly above
// typical typing pauses; each restart costs a full analysis in the worker.
const REFRESH_DEBOUNCE_MS = 1500;
// How long a hover waits for the background analysis before giving up and
// showing "analysis in progress" (the user can simply hover again later).
const HOVER_WAIT_MS = 8000;
// Requests to a settled session answer at once; a silent one is an older
// Mopsa that doesn't know the command.
const REQUEST_TIMEOUT_MS = 15000;

function isolationOk(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    typeof crossOriginIsolated !== "undefined" &&
    crossOriginIsolated
  );
}

class EnvEngine {
  private phase: EnvPhase = "idle";
  private session: MopsaSessionHandle | null = null;
  private client: DapClient | null = null;
  private signature: string | null = null;
  private generation = 0;
  private errorReason = "";
  /** True once used; gates the auto-refresh subscription. */
  private used = false;
  private subscribed = false;
  private refreshTimer: number | undefined;
  private cache = new Map<string, Promise<unknown>>();
  private settleWaiters: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private snapshot: EnvSnapshot = { phase: "idle", generation: 0 };

  /** Idempotent; wires the store subscription that keeps the session fresh. */
  init(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    useAppStore.subscribe(() => {
      if (!this.used) return;
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(
        () => this.refreshIfStale(),
        REFRESH_DEBOUNCE_MS,
      );
    });
  }

  // ── Observable state (useSyncExternalStore) ─────────────────────────────

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): EnvSnapshot => this.snapshot;

  private setPhase(phase: EnvPhase): void {
    this.phase = phase;
    if (
      this.snapshot.phase !== phase ||
      this.snapshot.generation !== this.generation
    ) {
      this.snapshot = { phase, generation: this.generation };
      this.listeners.forEach((l) => l());
    }
  }

  private currentSignature(): string {
    return computeInputSignature();
  }

  private unsupported(): string | null {
    if (!isolationOk())
      return "Abstract states need a cross-origin isolated page (SharedArrayBuffer).";
    const s = useAppStore.getState();
    const mode = getActiveAnalysisMode({
      fileTree: s.fileTree,
      activeFile: s.activeFile,
      lang: s.lang,
    });
    return unsupportedReason(s.lang, mode === "multilanguage");
  }

  private refreshIfStale(): void {
    if (!this.used) return;
    const sig = this.currentSignature();
    if (sig === this.signature) return;
    this.restart(sig);
  }

  private disposeSession(): void {
    this.client?.dispose();
    this.client = null;
    this.session?.kill();
    this.session = null;
  }

  private settle(phase: "ready" | "error", reason = ""): void {
    this.errorReason = reason;
    this.setPhase(phase);
    const ws = this.settleWaiters;
    this.settleWaiters = [];
    ws.forEach((w) => w());
  }

  /** Resolves when the session reaches ready/error, or after `ms`. */
  private waitSettled(ms?: number): Promise<void> {
    if (this.phase === "ready" || this.phase === "error")
      return Promise.resolve();
    return new Promise((resolve) => {
      const t = ms === undefined ? undefined : window.setTimeout(resolve, ms);
      this.settleWaiters.push(() => {
        window.clearTimeout(t);
        resolve();
      });
    });
  }

  private restart(sig: string): void {
    const gen = ++this.generation;
    this.disposeSession();
    this.signature = sig;
    this.cache.clear();

    const reason = this.unsupported();
    if (reason) {
      this.settle("error", reason);
      return;
    }
    const args = computeAnalysisArgs();
    if (!args) {
      this.settle("error", "Nothing to analyze.");
      return;
    }

    this.setPhase("starting");
    let session: MopsaSessionHandle;
    try {
      session = mopsaJs.startBackgroundSession("dap", args);
    } catch (e) {
      this.settle("error", String((e as Error).message ?? e));
      return;
    }
    this.session = session;
    const client = new DapClient((frame) => session.sendInput(frame));
    this.client = client;

    session.onData((bytes) => client.receive(bytes));
    session.onEnd(() => {
      // Normal sessions never end on their own (they idle in the DAP
      // terminated state); an end before `ready` is a failure.
      if (gen === this.generation && this.phase !== "ready")
        this.settle("error", "The analysis failed.");
    });
    session.onError((msg) => {
      if (gen === this.generation) this.settle("error", msg);
    });

    client.on("terminated", () => {
      if (gen !== this.generation) return;
      // The envdb now covers the whole run and stays queryable.
      this.settle("ready");
    });
    client.on("stopped", () => {
      if (gen !== this.generation) return;
      // Defensive: any stop after launch (e.g. the engine's error-recovery
      // stop) is resumed immediately — this session never pauses.
      if (this.phase === "analyzing") void client.continue_().catch(() => {});
    });

    void (async () => {
      try {
        await client.initialize();
        // The launch response is only written once the engine reaches its
        // first interaction point (it is already stopped there).
        await client.launch();
        if (gen !== this.generation) return;
        this.setPhase("analyzing");
        await client.continue_();
      } catch (e) {
        if (gen === this.generation && this.phase !== "ready")
          this.settle("error", String((e as Error).message ?? e));
      }
    })();
  }

  /** Brings the session up to date with the current inputs. */
  private refreshNow(): void {
    this.used = true;
    this.init();
    const sig = this.currentSignature();
    if (sig !== this.signature) {
      window.clearTimeout(this.refreshTimer);
      this.restart(sig);
    }
  }

  /** Starts (or refreshes) the background analysis without querying it. */
  start(): void {
    this.refreshNow();
  }

  /** Cached request to the settled session; null when not ready. */
  private request<T>(command: string, args: unknown): Promise<T> | null {
    const client = this.client;
    if (this.phase !== "ready" || !client) return null;
    const key = command + " " + JSON.stringify(args);
    let p = this.cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = client.sendRequest<T>(command, args, REQUEST_TIMEOUT_MS);
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }

  private async query<T>(
    command: string,
    args: unknown,
    waitMs?: number,
  ): Promise<EnvQueryResult<T>> {
    this.refreshNow();
    if (this.phase === "starting" || this.phase === "analyzing")
      await this.waitSettled(waitMs);
    if (this.phase === "error")
      return { kind: "unavailable", reason: this.errorReason };
    const p = this.request<T>(command, args);
    if (!p) return { kind: "analyzing" };
    try {
      return { kind: "ok", body: await p };
    } catch (e) {
      return { kind: "unavailable", reason: String((e as Error).message ?? e) };
    }
  }

  /**
   * Abstract environment at (file, line), all call stacks joined, for the
   * Monaco hover provider.
   */
  async getEnvironment(file: string, line: number): Promise<HoverEnvResult> {
    const r = await this.query<unknown>(
      "environment",
      { file, line },
      HOVER_WAIT_MS,
    );
    if (r.kind === "ok") return { kind: "env", env: r.body };
    return r.kind === "analyzing" ? r : { kind: "unavailable" };
  }

  /** States at (file, line), one per call stack. Waits for the analysis. */
  getEnvironments(
    file: string,
    line: number,
    scope: EnvScope,
  ): Promise<EnvQueryResult<EnvironmentsBody>> {
    return this.query("environments", { file, line, scope });
  }

  /** Lines of `file` recorded in the envdb. Waits for the analysis. */
  getLines(file: string): Promise<EnvQueryResult<EnvdbLinesBody>> {
    return this.query("envdbLines", { file });
  }
}

export const envEngine = new EnvEngine();
