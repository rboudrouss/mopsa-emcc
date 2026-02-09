# Dependecies :
# Ocaml 4.12.0


.DELETE_ON_ERROR:
.ONESHELL:

# Variables
INSTALL_DIR := $(CURDIR)/libs
LIBS_DIR := $(INSTALL_DIR)/lib
DIST_DIR := $(CURDIR)/dist
DEPS_DIR := $(CURDIR)/deps
BUILD_DIR := $(CURDIR)/build
LLVM_BUILD_DIR := $(DEPS_DIR)/llvm-project/build

EMCC := emcc
EMCONFIGURE := emconfigure
EMCMAKE := emcmake
EMMAKE := emmake
EMAR := emar
OPAM_EXEC := opam exec --
NPM := pnpm

OCAML_STDLIB := $(shell ocamlc -where)
OPAM_PREFIX := $(OCAML_STDLIB)/../../

#EMCC_SIDE_MODULE := -s SIDE_MODULE=1 -fPIC

# Needed to build old clang versions
CC=gcc-11
CCX=g++-11

# Targets
all: final

init:
	mkdir -p $(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR)

# OCAML-WASM
libcamlrun: $(BUILD_DIR)/libcamlrun.a

$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a: init
	cd $(DEPS_DIR)/ocaml-wasm
	$(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc --disable-systhreads
	$(MAKE) -C runtime ocamlrun
	cp runtime/prims.o $(BUILD_DIR)
	cp runtime/libcamlrun.a $(BUILD_DIR)


# Build deps

deps: camlstr stubs

camlstr: $(BUILD_DIR)/libcamlstr.a

$(BUILD_DIR)/libcamlstr.a: init
	cd $(DEPS_DIR)/ocaml-wasm/otherlibs/str
	make all || true
	$(EMCC) -shared -o ./dllcamlstr.so strstubs.o
	$(EMAR) rcs libcamlstr.a strstubs.o
	cp libcamlstr.a $(BUILD_DIR)

STUB_LIBS := libpolkaMPQ_caml.a liboctMPQ_caml.a libboxMPQ_caml.a libapron_caml.a \
             libmopsa_c_parser_stubs.a libmopsa_utils_stubs.a libzarith.a \
             libmpfr.a libgmp.a libcamlidl.a \
             libpolkaMPQ.a liboctMPQ.a libboxMPQ.a libapron.a \
             libclang-cpp.a libclang.a libLLVM-19.a libunix.a

stubs: $(addprefix $(BUILD_DIR)/,$(STUB_LIBS))

$(BUILD_DIR)/lib%.a: backend/wasm/stubs/empty.o
	$(EMAR) rcs $@ $<

# Mopsa with deps

## MOPSA-bytecode
mopsa-bc: $(DIST_DIR)/mopsa.bc $(BUILD_DIR)/libcamlrun.a

$(DIST_DIR)/mopsa.bc: init deps
	$(OPAM_EXEC) dune build backend/wasm/mopsa_worker.bc --profile release
	rm -f $(DIST_DIR)/mopsa.bc
	cp _build/default/backend/wasm/mopsa_worker.bc $(DIST_DIR)/mopsa.bc

# Build final binary
final: $(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc
	$(EMCC) -Wall -g -fno-strict-aliasing -fwrapv \
	--ffunction-sections -o $(DIST_DIR)/ocamlrun.html \
	-s ENVIRONMENT='web' --preload-file $(BUILD_DIR)/mopsa.bc \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS', 'run','callMain']" \
	--pre-js backend/wasm/pre.js \
	$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a

# Clean
clean: clean-mopsa clean-ocaml clean-project

clean-project:
	dune clean
	rm -rf $(DIST_DIR) $(INSTALL_DIR) $(BUILD_DIR)

clean-ocaml:
	$(MAKE) -C $(DEPS_DIR)/ocaml-wasm clean

clean-mopsa:
	$(MAKE) -C $(DEPS_DIR)/mopsa-analyzer clean
