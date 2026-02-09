# Dependecies :
# Ocaml 4.12.0


.DELETE_ON_ERROR:
.ONESHELL:

# Variables
INSTALL_DIR := libs
LIBS_DIR := $(INSTALL_DIR)/lib
DIST_DIR := dist
DEPS_DIR := deps
LLVM_BUILD_DIR := $(DEPS_DIR)/llvm-project/build

EMCC := emcc
EMCONFIGURE := emconfigure
EMCMAKE := emcmake
EMMAKE := emmake
OPAM_EXEC := opam exec --
NPM := pnpm

OCAML_STDLIB := $(shell ocamlc -where)

EMCC_SIDE_MODULE := -s SIDE_MODULE=1 -fPIC

# Needed to build old clang versions
CC=gcc-11
CCX=g++-11

# Targets
init:
	mkdir -p dist

# OCAML-WASM
ocaml-wasm: $(DIST_DIR)/ocamlrun.js $(DIST_DIR)/ocamlrun.wasm

$(DIST_DIR)/ocamlrun.js $(DIST_DIR)/ocamlrun.wasm: init
	cd $(DEPS_DIR)/ocaml-wasm
	$(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc
# --disable-systhreads
	$(MAKE) -C runtime ocamlrun.js
	cp runtime/ocamlrun.js ../../$(DIST_DIR)
	cp runtime/ocamlrun.wasm ../../$(DIST_DIR)

# MOPSA-bytecode
mopsa-bc: $(DIST_DIR)/mopsa_worker.bc

$(DIST_DIR)/mopsa_worker.bc: init
	$(OPAM_EXEC) dune build backend/wasm/mopsa_worker.bc --profile release
	cp _build/default/backend/wasm/mopsa_worker.bc $(DIST_DIR)
