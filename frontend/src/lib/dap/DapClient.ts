import type {
  DapBreakpoint,
  DapMessage,
  DapScope,
  DapStackFrame,
  DapVariable,
} from "./types";

/**
 * Debug Adapter Protocol client for Mopsa's `-engine=dap`.
 *
 * Speaks the wire protocol over a session: requests are framed
 * `Content-Length: N\r\n\r\n<json>` and pushed to stdin via `send`; the raw
 * stdout byte stream is fed back through `receive`, reassembled into frames,
 * and dispatched. Responses are correlated to requests by `request_seq`
 * (Mopsa always writes seq:0, so we cannot rely on `seq`). Events
 * (stopped/output/terminated/initialized) go to `on` listeners.
 */
export class DapClient {
  private seq = 1;
  private pending = new Map<
    number,
    { resolve: (body: unknown) => void; reject: (e: Error) => void }
  >();
  private listeners = new Map<string, Set<(body: unknown) => void>>();
  private buf: number[] = [];
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  // Requests are serialized: the SAB stdin channel has a single slot, so a
  // second writeMessage before the worker consumes the first would clobber it.
  // We send the next request only after the previous one's response settles.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly send: (frame: string) => void) {}

  /** Feed raw stdout bytes coming from the session. */
  receive(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    this.parse();
  }

  /** Subscribe to a DAP event; returns an unsubscribe function. */
  on(event: string, cb: (body: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  private once(event: string): Promise<unknown> {
    return new Promise((resolve) => {
      const off = this.on(event, (body) => {
        off();
        resolve(body);
      });
    });
  }

  sendRequest<T = unknown>(command: string, args?: unknown): Promise<T> {
    const fire = () => this.fire<T>(command, args);
    const result = this.queue.then(fire, fire);
    // Advance the queue once this request settles (resolved or rejected),
    // so the next request only writes after the worker freed the slot.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private fire<T>(command: string, args?: unknown): Promise<T> {
    const seq = this.seq++;
    const msg: DapMessage = { seq, type: "request", command };
    if (args !== undefined) (msg as { arguments?: unknown }).arguments = args;
    const json = JSON.stringify(msg);
    const frame =
      "Content-Length: " +
      this.encoder.encode(json).length +
      "\r\n\r\n" +
      json;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, {
        resolve: resolve as (b: unknown) => void,
        reject,
      });
      this.send(frame);
    });
  }

  /** Reject all in-flight requests (e.g. on session end/kill). */
  dispose(): void {
    this.pending.forEach((p) => p.reject(new Error("DAP session closed")));
    this.pending.clear();
    this.listeners.clear();
  }

  // ── Frame reassembly ───────────────────────────────────────────────────────

  private parse(): void {
    while (true) {
      const headerEnd = this.findHeaderEnd();
      if (headerEnd < 0) return;
      const header = String.fromCharCode(...this.buf.slice(0, headerEnd));
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      const bodyStart = headerEnd + 4;
      if (!m) {
        this.buf.splice(0, bodyStart); // malformed header, skip it
        continue;
      }
      const len = parseInt(m[1], 10);
      if (this.buf.length < bodyStart + len) return; // body incomplete
      const bodyBytes = Uint8Array.from(this.buf.slice(bodyStart, bodyStart + len));
      this.buf.splice(0, bodyStart + len);
      try {
        this.dispatch(JSON.parse(this.decoder.decode(bodyBytes)) as DapMessage);
      } catch {
        /* ignore non-JSON noise */
      }
    }
  }

  private findHeaderEnd(): number {
    for (let i = 0; i + 3 < this.buf.length; i++) {
      if (
        this.buf[i] === 13 &&
        this.buf[i + 1] === 10 &&
        this.buf[i + 2] === 13 &&
        this.buf[i + 3] === 10
      )
        return i;
    }
    return -1;
  }

  private dispatch(msg: DapMessage): void {
    if (msg.type === "response" && msg.request_seq !== undefined) {
      const p = this.pending.get(msg.request_seq);
      if (!p) return;
      this.pending.delete(msg.request_seq);
      if (msg.success === false) {
        const body = msg.body as { error?: { format?: string } } | undefined;
        p.reject(new Error(body?.error?.format ?? "DAP request failed"));
      } else {
        p.resolve(msg.body);
      }
    } else if (msg.type === "event" && msg.event) {
      this.listeners.get(msg.event)?.forEach((cb) => cb(msg.body));
    }
  }

  // ── Typed convenience wrappers (mapping to dap.ml commands) ──────────────────

  async initialize(): Promise<void> {
    const initialized = this.once("initialized");
    await this.sendRequest("initialize", {
      adapterID: "mopsa",
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: "path",
    });
    await initialized;
  }

  launch(): Promise<unknown> {
    return this.sendRequest("launch", {});
  }

  setBreakpoints(path: string, lines: number[]): Promise<{ breakpoints: DapBreakpoint[] }> {
    return this.sendRequest("setBreakpoints", {
      source: { path },
      breakpoints: lines.map((line) => ({ line })),
      lines,
    });
  }

  setExceptionBreakpoints(filters: string[] = []): Promise<unknown> {
    return this.sendRequest("setExceptionBreakpoints", { filters });
  }

  threads(): Promise<{ threads: { id: number; name: string }[] }> {
    return this.sendRequest("threads");
  }

  stackTrace(threadId = 1): Promise<{ totalFrames: number; stackFrames: DapStackFrame[] }> {
    return this.sendRequest("stackTrace", { threadId });
  }

  scopes(frameId: number): Promise<{ scopes: DapScope[] }> {
    return this.sendRequest("scopes", { frameId });
  }

  variables(variablesReference: number): Promise<{ variables: DapVariable[] }> {
    return this.sendRequest("variables", { variablesReference });
  }

  continue_(threadId = 1): Promise<unknown> {
    return this.sendRequest("continue", { threadId });
  }
  next(threadId = 1): Promise<unknown> {
    return this.sendRequest("next", { threadId });
  }
  stepIn(threadId = 1): Promise<unknown> {
    return this.sendRequest("stepIn", { threadId });
  }
  stepOut(threadId = 1): Promise<unknown> {
    return this.sendRequest("stepOut", { threadId });
  }
  restart(): Promise<unknown> {
    return this.sendRequest("restart");
  }
  restartFrame(frameId: number): Promise<unknown> {
    return this.sendRequest("restartFrame", { frameId });
  }
  disconnect(): Promise<unknown> {
    return this.sendRequest("disconnect", {});
  }
  evaluate(
    expression: string,
    frameId?: number,
    context = "watch",
  ): Promise<{ result: string | null; variablesReference: number }> {
    return this.sendRequest("evaluate", { expression, frameId, context });
  }
}
