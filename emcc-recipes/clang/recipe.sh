# Clang 9: the version Mopsa's C frontend (Clang_to_ml.cc) is tested with
# under wasm.  The host's LLVM, which the opam package is configured with,
# may be any other version.
LLVM_VERSION=9.0.1
include_recipe clang
