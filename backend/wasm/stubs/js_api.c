/*
 * js_api.c — OCaml C primitives for JavaScript interop in the WASM build.
 *
 * These three functions form the event-loop bridge between the OCaml
 * bytecode runtime (suspended via Asyncify) and the JavaScript side:
 *
 *   caml_emscripten_sleep  – suspend the WASM stack for N ms, letting
 *                            the JS event loop run (sets/reads commands).
 *   caml_js_get_command    – return and clear Module._pendingCommand.
 *   caml_js_signal_done    – call Module._resolveAnalysis(), which resolves
 *                            the JS Promise and restores Module.print.
 *
 * Build requirements:
 *   emcc -s ASYNCIFY=1 (needed for caml_emscripten_sleep / emscripten_sleep)
 */

#include <emscripten.h>
#include <caml/mlvalues.h>
#include <caml/memory.h>
#include <caml/alloc.h>
#include <stdlib.h>
#include <string.h>

/* --------------------------------------------------------------------------
 * caml_emscripten_sleep(ms)
 * Wraps emscripten_sleep() so OCaml bytecode can yield to the JS event loop.
 * Requires -s ASYNCIFY=1 in the Emscripten link step.
 * -------------------------------------------------------------------------- */
CAMLprim value caml_emscripten_sleep(value v_ms)
{
    CAMLparam1(v_ms);
    emscripten_sleep(Int_val(v_ms));
    CAMLreturn(Val_unit);
}

/* --------------------------------------------------------------------------
 * caml_js_get_command() -> string
 * Reads Module._pendingCommand from JS, clears it, and returns it as an
 * OCaml string.  Returns "" when no command is pending.
 * -------------------------------------------------------------------------- */
EM_JS(char *, js_get_command_impl, (), {
    var cmd = Module._pendingCommand || "";
    Module._pendingCommand = "";
    var len = lengthBytesUTF8(cmd) + 1;
    var buf = _malloc(len);
    stringToUTF8(cmd, buf, len);
    return buf;
})

CAMLprim value caml_js_get_command(value unit)
{
    CAMLparam1(unit);
    CAMLlocal1(result);
    char *buf = js_get_command_impl();
    result = caml_copy_string(buf);
    free(buf);
    CAMLreturn(result);
}

/* --------------------------------------------------------------------------
 * caml_js_signal_done()
 * Invokes Module._resolveAnalysis() so the JS Promise resolves with the
 * output that was captured via the Module.print override.
 * -------------------------------------------------------------------------- */
EM_JS(void, js_signal_done_impl, (), {
    if (Module._resolveAnalysis) {
        var resolve = Module._resolveAnalysis;
        Module._resolveAnalysis = null;
        resolve();
    }
})

CAMLprim value caml_js_signal_done(value unit)
{
    CAMLparam1(unit);
    js_signal_done_impl();
    CAMLreturn(Val_unit);
}
