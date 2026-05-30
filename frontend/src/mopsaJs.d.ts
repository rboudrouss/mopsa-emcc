declare global {
  /**
   * A live interactive/DAP run. Output streams back as raw bytes (xterm
   * accepts Uint8Array directly; the DAP client reassembles Content-Length
   * frames). Input is written synchronously over a SharedArrayBuffer channel.
   */
  interface MopsaSessionHandle {
    readonly engine: "interactive" | "dap";
    /** Fired once the worker has launched the run. */
    onStarted: (cb: () => void) => void;
    /** Raw stdout/stderr bytes as they are produced. */
    onData: (cb: (bytes: Uint8Array) => void) => void;
    /** The run exited (code from OCaml exit, or -1 if killed). */
    onEnd: (cb: (code: number) => void) => void;
    /** A fatal worker/WASM error ended the session. */
    onError: (cb: (message: string) => void) => void;
    /** Feed a chunk to stdin (UTF-8 encoded in the worker). */
    sendInput: (data: string) => void;
    /** Signal end-of-input (stdin EOF). */
    sendEof: () => void;
    /** Terminate the run (worker.terminate + respawn). */
    kill: () => void;
  }

  /** The Mopsa WASM API injected by post.js after the module initialises. */
  const mopsaJs: {
    /** Default universal-language config JSON string. */
    configUni: string;

    /**
     * Run an analysis and return the captured stdout/stderr output.
     * Async because it hands off to the OCaml event loop in WASM.
     */
    analyze: (options: string[]) => Promise<string>;

    /**
     * Start a long-lived interactive or DAP session. Do NOT pass -engine in
     * options; it is derived from the engine argument. Throws if the page is
     * not cross-origin isolated (SharedArrayBuffer unavailable).
     */
    startSession: (
      engine: "interactive" | "dap",
      options: string[],
    ) => MopsaSessionHandle;

    writeFile: (filename: string, content: string) => void;
    setCode: (code: string) => void;
    setConfig: (config: string) => void;
    readFile: (filename: string) => string;
    getCode: () => string;
    getConfig: () => string;
    listDir: (dir: string) => [number, ...string[]];
    deleteFile: (filename: string) => void;
    changeCodeFilePath: (path: string) => void;
    getCodeFilePath: () => [0, string];
  };

  interface unknownFolder {
    [key: string]: string | unknownFolder;
  }

  interface shareData {
    configs: {
      c: { "default.json": string; [key: string]: string | undefined };
      python: { "default.json": string; [key: string]: string | undefined };
      cfg: { "default.json": string; [key: string]: string | undefined };
      universal: { "default.json": string; [key: string]: string | undefined };
    };
    stubs: {
      c: unknownFolder;
      python: unknownFolder;
      cpython: unknownFolder;
    };
  }

  // Populated at startup by mopsa-client.ts from the bundled share.json.
  var shareData: shareData;
}

export {};
