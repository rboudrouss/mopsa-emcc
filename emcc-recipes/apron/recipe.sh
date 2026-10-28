# Apron (ocaml-emcc's builtin recipe), with ap_fpu_init succeeding under
# wasm.  wasm cannot change the FPU rounding mode, so apron prints warnings
# whenever a box or octagon manager is allocated.  Mopsa only uses the exact
# MPQ domains (boxMPQ, octMPQ, polkaMPQ), which do not depend on the
# rounding mode: the warnings are noise here.
include_recipe apron

pre_build() {
  sed -i '/^#elif defined(sun)/,/^#else/ s/^#else$/#elif defined(__EMSCRIPTEN__)\nbool ap_fpu_init(void) { return true; }\n#else/' \
    apron/ap_manager.c
  grep -q '__EMSCRIPTEN__' apron/ap_manager.c || die "apron: ap_fpu_init not found in ap_manager.c"
}
