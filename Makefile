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
OPAM_EXEC := opam exec --
NPM := pnpm

OCAML_STDLIB := $(shell ocamlc -where)

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

$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a: init $(BUILD_DIR)/mopsa.bc
	cd $(DEPS_DIR)/ocaml-wasm
	$(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc --disable-systhreads
	$(MAKE) -C runtime ocamlrun
	cp runtime/prims.o $(BUILD_DIR)
	cp runtime/libcamlrun.a $(BUILD_DIR)

# MOPSA-bytecode
mopsa-bc: $(BUILD_DIR)/mopsa_bonly.bc

$(BUILD_DIR)/mopsa_bonly.bc: init
	$(OPAM_EXEC) dune build backend/wasm/mopsa_worker.bc --profile release
	rm -f $(BUILD_DIR)/mopsa_bonly.bc
	cp _build/default/backend/wasm/mopsa_worker.bc $(BUILD_DIR)/mopsa_bonly.bc

# Build deps

deps:

# Mopsa with deps

mopsa-final: $(BUILD_DIR)/mopsa.bc

## For now we cp only
$(BUILD_DIR)/mopsa.bc: $(BUILD_DIR)/mopsa_bonly.bc deps
	rm -f $(BUILD_DIR)/mopsa.bc
	cp $(BUILD_DIR)/mopsa_bonly.bc $(BUILD_DIR)/mopsa.bc

# Build final binary
final: $(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc
	$(EMCC) -Wall -g -fno-strict-aliasing -fwrapv \
	--ffunction-sections -o $(DIST_DIR)/ocamlrun.html \
	-s ENVIRONMENT='web' --preload-file $(BUILD_DIR)/mopsa.bc \
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
