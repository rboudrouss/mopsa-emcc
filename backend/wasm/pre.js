Module["arguments"] = ['build/mopsa.bc'];

// Debug: log crash details
Module["onAbort"] = function(what) {
  console.error("[DEBUG] Abort:", what);
  if (typeof wasmTable !== 'undefined') {
    console.error("[DEBUG] WASM table size:", wasmTable.length);
  }
};

// === DEBUG: intercept WASM table out-of-bounds accesses ===
// Patch WebAssembly.Table.prototype.get BEFORE the module is set up so it
// applies to every invoke_*() call.  When an index is out of range we log it
// and let the native exception propagate so the existing error handler still
// fires, but now we know the bad index.
(function () {
  var _origGet = WebAssembly.Table.prototype.get;
  WebAssembly.Table.prototype.get = function (index) {
    if (index < 0 || index >= this.length) {
      // Capture the JavaScript call stack at this point.
      var jsStack = new Error("[DEBUG] WASM table.get(" + index + ") is OUT OF BOUNDS (table size=" + this.length + ")").stack;
      console.error(jsStack);

      // Try to give a hint about which OCaml primitive is being called.
      // The invoke_iii/invoke_ii wrapper passes `index` as the first argument;
      // it comes from caml_builtin_cprim[] or from a C function pointer.
      console.error("[DEBUG] Bad function-table index: " + index + "  (0x" + index.toString(16) + ")");
    }
    return _origGet.call(this, index);
  };
})();

// === DEBUG: after the runtime is fully initialised, dump diagnostics ===
Module["onRuntimeInitialized"] = function () {
  console.log("[DEBUG] Runtime initialised. WASM table size:", wasmTable.length);

  // Try to read the size of caml_builtin_cprim from WASM memory.
  // caml_names_of_builtin_cprim is a null-terminated array of char*.
  // We walk it to count entries and compare with the table size.
  try {
    var exports = Module["asm"] || wasmExports;
    if (exports && exports["caml_builtin_cprim"]) {
      console.log("[DEBUG] caml_builtin_cprim exported:", exports["caml_builtin_cprim"]);
    }
  } catch(e) {
    console.log("[DEBUG] Could not inspect caml_builtin_cprim:", e.message);
  }
};
