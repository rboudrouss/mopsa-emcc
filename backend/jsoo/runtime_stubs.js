// js_of_ocaml runtime stubs for C primitives that run at module
// initialisation time. The analyzer links Apron/mlgmpidl (C libraries)
// even in the jsoo build; their domains are unusable in JS (calling any
// real primitive raises), but module init must not crash. Each stub
// below is a no-op that only satisfies load-time calls.

// utils/core/lineEdit.ml probes terminal support at module init with
// `try Unix.tcgetattr stdin with Unix.Unix_error _ -> None`. js_of_ocaml
// has no tcgetattr; without this stub the missing primitive surfaces as
// Failure (uncaught) and the worker dies at load. Raising a real
// Unix_error lets the upstream code take its "no terminal" path.
//Provides: unix_tcgetattr
//Requires: caml_named_value, caml_raise_with_args, caml_string_of_jsbytes, caml_failwith
function unix_tcgetattr(fd) {
  var tag = caml_named_value("Unix.Unix_error");
  if (tag)
    caml_raise_with_args(tag, [
      0, // any Unix.error constructor works; callers match Unix_error _
      caml_string_of_jsbytes("tcgetattr"),
      caml_string_of_jsbytes(""),
    ]);
  caml_failwith("tcgetattr not implemented");
}

//Provides: camlidl_apron_init
function camlidl_apron_init(unit) {
  return 0;
}

//Provides: camlidl_apron_set_var_operations
function camlidl_apron_set_var_operations(unit) {
  return 0;
}

//Provides: camlidl_oct_oct_manager_alloc
function camlidl_oct_oct_manager_alloc() {
  return 0;
}

//Provides: camlidl_environment_ap_environment_make
function camlidl_environment_ap_environment_make() {
  return 0;
}

//Provides: camlidl_abstract1_ap_abstract1_top
function camlidl_abstract1_ap_abstract1_top() {
  return 0;
}

//Provides: camlidl_abstract1_ap_abstract1_bottom
function camlidl_abstract1_ap_abstract1_bottom() {
  return 0;
}

//Provides: camlidl_polka_pk_manager_alloc_loose
function camlidl_polka_pk_manager_alloc_loose() {
  return 0;
}

//Provides: camlidl_polka_pk_manager_alloc_equalities
function camlidl_polka_pk_manager_alloc_equalities() {
  return 0;
}
