// pre.js – factory-level defaults.
// With MODULARIZE each createMopsaModule() call can override these.
Module["onAbort"] = function (what) {
  console.error("[Mopsa WASM] Abort:", what);
};
