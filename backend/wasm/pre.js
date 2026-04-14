Module["arguments"] = ['build/mopsa.bc'];

// Debug: log crash details
Module["onAbort"] = function(what) {
  console.error("[DEBUG] Abort:", what);
  if (typeof wasmTable !== 'undefined') {
    console.error("[DEBUG] WASM table size:", wasmTable.length);
  }
};