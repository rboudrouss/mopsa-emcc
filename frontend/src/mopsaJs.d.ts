declare global {
  /** The Mopsa WASM API injected by post.js after the module initialises. */
  const mopsaJs: {
    /** Default universal-language config JSON string. */
    configUni: string;

    /**
     * Run an analysis and return the captured stdout/stderr output.
     * Async because it hands off to the OCaml event loop in WASM.
     */
    analyze: (options: string[]) => Promise<string>;

    writeFile: (filename: string, content: string) => void;
    setCode: (code: string) => void;
    setConfig: (config: string) => void;
    readFile: (filename: string) => string;
    getCode: () => string;
    getConfig: () => string;
    listDir: (dir: string) => [number, ...string[]];
    deleteFile: (filename: string) => void;
  };

  interface unknownFolder {
    [key: string]: string | unknownFolder;
  }

  interface shareData {
    configs: {
      c:         { "default.json": string; [key: string]: string | undefined };
      python:    { "default.json": string; [key: string]: string | undefined };
      cfg:       { "default.json": string; [key: string]: string | undefined };
      universal: { "default.json": string; [key: string]: string | undefined };
    };
    stubs: {
      c:       unknownFolder;
      python:  unknownFolder;
      cpython: unknownFolder;
    };
  }

  // Populated at startup by mopsaJs.ts from the bundled share.json.
  var shareData: shareData;
}

export {};

