import type { SupportedLanguage } from "./types";

/**
 * Analysis backend selection.
 *
 * Two implementations of the `mopsaJs` API exist in public/:
 *   - wasm (mopsa_api.js):      the full analyzer compiled with Emscripten.
 *   - jsoo (mopsa_api_jsoo.js): the analyzer compiled to plain JavaScript
 *     with js_of_ocaml. Lighter, but feature-reduced: no C / cross-language
 *     analysis (Clang is a C++ library) and no Apron relational domains.
 *
 * The setting is `auto` (default) | `wasm` | `jsoo`, surfaced as the
 * `__backend` pseudo-option in the Options panel ("Browser Compat"). With
 * `auto`, WebAssembly support is probed and jsoo is used as fallback; an
 * explicit `wasm` is also downgraded to jsoo when the browser can't run
 * WASM at all.
 *
 * The choice is read synchronously by a loader script in index.html BEFORE
 * the React bundle runs (mopsaJs must exist when the app boots) — the
 * resolution logic there must stay in sync with getBackend(). It is stored
 * in localStorage and switching requires a page reload.
 */
export type MopsaBackend = "wasm" | "jsoo";
export type BackendSetting = "auto" | MopsaBackend;

const BACKEND_KEY = "mopsa-backend";

/** The user's stored preference (what the Options select shows). */
export function getBackendSetting(): BackendSetting {
  try {
    const v = localStorage.getItem(BACKEND_KEY);
    return v === "wasm" || v === "jsoo" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Whether this browser can instantiate WebAssembly (mirrors index.html). */
export function wasmSupported(): boolean {
  try {
    if (
      typeof WebAssembly === "object" &&
      typeof WebAssembly.instantiate === "function"
    ) {
      // Minimal valid module: "\0asm" + version 1.
      const mod = new WebAssembly.Module(
        new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
      );
      return new WebAssembly.Instance(mod) instanceof WebAssembly.Instance;
    }
  } catch {
    /* fall through */
  }
  return false;
}

/** The backend actually loaded (same resolution as the index.html loader). */
export function getBackend(): MopsaBackend {
  return getBackendSetting() === "jsoo" || !wasmSupported() ? "jsoo" : "wasm";
}

/** True when jsoo is active only because the browser can't run WASM. */
export function isWasmFallback(): boolean {
  return getBackendSetting() !== "jsoo" && !wasmSupported();
}

export function setBackendSetting(setting: BackendSetting): void {
  if (setting === getBackendSetting()) return;
  try {
    if (setting === "auto") localStorage.removeItem(BACKEND_KEY);
    else localStorage.setItem(BACKEND_KEY, setting);
  } catch {
    return;
  }
  // mopsaJs is loaded synchronously at page boot; swapping backends live
  // would leak workers and stale state. A reload keeps it simple.
  location.reload();
}

export interface BackendCapabilities {
  /** Languages the backend can analyze. */
  languages: SupportedLanguage[];
  /** Cross-language (C + Python) workspaces. */
  multilanguage: boolean;
}

export const BACKEND_CAPABILITIES: Record<MopsaBackend, BackendCapabilities> = {
  wasm: { languages: ["c", "python", "universal"], multilanguage: true },
  jsoo: { languages: ["python", "universal"], multilanguage: false },
};

const SWITCH_HINT =
  "Select the WebAssembly backend in Options → Browser Compat to analyze it.";

/** Human-readable reason a run cannot proceed, or null if supported. */
export function unsupportedReason(
  lang: SupportedLanguage,
  isMultilang: boolean,
): string | null {
  const caps = BACKEND_CAPABILITIES[getBackend()];
  if (isMultilang && !caps.multilanguage)
    return `Cross-language (C + Python) analysis is not available with the JavaScript (js_of_ocaml) backend. ${SWITCH_HINT}`;
  if (!caps.languages.includes(lang))
    return `The ${lang === "c" ? "C" : lang} language is not available with the JavaScript (js_of_ocaml) backend. ${SWITCH_HINT}`;
  return null;
}
