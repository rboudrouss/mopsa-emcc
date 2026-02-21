/*
 * Stubs for mlclang_* C functions that are normally provided by
 * Clang_to_ml.cc (which links against Clang/LLVM).
 */

#include <caml/mlvalues.h>
#include <caml/memory.h>
#include <caml/fail.h>

/* external dump_block: recursive:bool -> 'a -> unit = "mlclang_dump_block" */
CAMLprim value mlclang_dump_block(value recursive, value v) {
  CAMLparam2(recursive, v);
  caml_failwith("mlclang_dump_block: Clang C parser not available in WASM build");
  CAMLreturn(Val_unit);
}

/* external get_default_target_options: unit -> target_options = "mlclang_get_default_target_options" */
CAMLprim value mlclang_get_default_target_options(value unit) {
  CAMLparam1(unit);
  caml_failwith("mlclang_get_default_target_options: Clang C parser not available in WASM build");
  CAMLreturn(Val_unit);
}

/* external get_target_info: target_options -> target_info = "mlclang_get_target_info" */
CAMLprim value mlclang_get_target_info(value target) {
  CAMLparam1(target);
  caml_failwith("mlclang_get_target_info: Clang C parser not available in WASM build");
  CAMLreturn(Val_unit);
}

/* external parse: command:string -> target:target_options -> filename:string -> args:string array -> parse_result = "mlclang_parse" */
CAMLprim value mlclang_parse(value command, value target, value name, value args) {
  CAMLparam4(command, target, name, args);
  caml_failwith("mlclang_parse: Clang C parser not available in WASM build");
  CAMLreturn(Val_unit);
}

