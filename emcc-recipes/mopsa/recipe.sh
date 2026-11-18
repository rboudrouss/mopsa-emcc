# Mopsa, installed in the switch from upstream (see the Makefile), changed
# by patches/ for wasm32 and for this interface. The patches apply to the
# C stubs (floats_round.c, the C parser built against clang 9) and to the
# OCaml libraries, which ocaml-emcc builds for the target before the
# program (PATCH_OCAML). The native build in the switch stays upstream's.
# The jsoo backend applies the same patches to its copy of the sources.
SOURCE=opam:mopsa
PATCH_OCAML=1
DEPENDS=clang

build() {
  apply_patches "$RECIPE_DIR/patches"
  dune_stubs mopsa
}
