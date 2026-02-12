# Dependecies :
# Ocaml 4.12.0

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

#EMCC_SIDE_MODULE := -s SIDE_MODULE=1 -fPIC

# Needed to build old clang versions
CC=gcc-11
CCX=g++-11

# Targets
all: init final

$(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR):
	mkdir -p $(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR)

# OCAML-WASM
libcamlrun: $(BUILD_DIR)/libcamlrun.a

$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a: | $(BUILD_DIR)
	cd $(DEPS_DIR)/ocaml-wasm
	$(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc --disable-systhreads
	$(MAKE) -C runtime ocamlrun
	cp runtime/prims.o $(BUILD_DIR)
	cp runtime/libcamlrun.a $(BUILD_DIR)

# MOPSA-bytecode
mopsa-bc: $(BUILD_DIR)/mopsa_bonly.bc

$(BUILD_DIR)/mopsa_bonly.bc: | $(BUILD_DIR)
	$(OPAM_EXEC) dune build backend/wasm/mopsa_worker.bc --profile release
	rm -f $(BUILD_DIR)/mopsa_bonly.bc
	cp _build/default/backend/wasm/mopsa_worker.bc $(BUILD_DIR)/mopsa_bonly.bc

# Build deps

deps: camlstr stubs

camlstr: $(BUILD_DIR)/dllcamlstr.so

$(BUILD_DIR)/dllcamlstr.so: | $(BUILD_DIR)
	cd $(DEPS_DIR)/ocaml-wasm/otherlibs/str
	make all || true
	$(EMCC) -sSIDE_MODULE=1 -o ./dllcamlstr.so strstubs.o
	$(EMAR) rcs libcamlstr.a strstubs.o
	cp libcamlstr.a $(BUILD_DIR)
	cp dllcamlstr.so $(BUILD_DIR)

STUB_LIBS := dllpolkaMPQ_caml.so dlloctMPQ_caml.so dllboxMPQ_caml.so dllapron_caml.so \
             dllmopsa_c_parser_stubs.so dllmopsa_utils_stubs.so dllzarith.so \
             dllmpfr.so dllgmp.so dllcamlidl.so \
             dllpolkaMPQ.so dlloctMPQ.so dllboxMPQ.so dllapron.so \
             dllclang-cpp.so dllclang.so dllLLVM-19.so dllunix.so

stubs: $(addprefix $(BUILD_DIR)/,$(STUB_LIBS))

$(BUILD_DIR)/dll%.so: backend/wasm/stubs/empty.o | $(BUILD_DIR)
	$(EMCC) -sSIDE_MODULE=1 -o $@ $<

# Mopsa with deps

mopsa-final: $(BUILD_DIR)/mopsa.bc

## For now we cp only
$(BUILD_DIR)/mopsa.bc: $(BUILD_DIR)/mopsa_bonly.bc deps
	rm -f $(BUILD_DIR)/mopsa.bc
	cp $(BUILD_DIR)/mopsa_bonly.bc $(BUILD_DIR)/mopsa.bc

# Build final binary
final: $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc $(BUILD_DIR)/dllcamlstr.so
	$(EMCC) -Wall -g -fno-strict-aliasing -fwrapv \
	--ffunction-sections -o $(DIST_DIR)/ocamlrun.html \
	-s ENVIRONMENT='web' --preload-file $(BUILD_DIR)/mopsa.bc \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS', 'run','callMain']" \
	--pre-js backend/wasm/pre.js --post-js backend/wasm/post.js -s DYLINK_DEBUG=1 \
	--preload-file $(BUILD_DIR)/dllcamlstr.so@/dllcamlstr \
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
