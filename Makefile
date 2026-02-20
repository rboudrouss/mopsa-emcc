# Dependecies :
# Ocaml 4.12.0

EMCC_FLAGS := "-fno-strict-aliasing -fwrapv"
COMP_FLAGS := "-fno-common -D_FILE_OFFSET_BITS=64"
COMP_CAMLFFI_FLAGS := "-DCAML_NAME_SPACE -DCAMLDLLIMPORT="

.ONESHELL:

# Variables
INSTALL_DIR := $(CURDIR)/libs
LIBS_DIR := $(INSTALL_DIR)/lib
DIST_DIR := $(CURDIR)/dist
DEPS_DIR := $(CURDIR)/deps
BUILD_DIR := $(CURDIR)/build
DEPS_BIN_DIR := $(BUILD_DIR)/deps
LLVM_BUILD_DIR := $(DEPS_DIR)/llvm-project/build

EMCC := emcc
EMCONFIGURE := emconfigure
EMCMAKE := emcmake
EMMAKE := emmake
EMAR := emar
OPAM_EXEC := opam exec --
NPM := pnpm

NPROC := $(shell nproc 2>/dev/null || echo 1)

OCAML_STDLIB := $(shell ocamlc -where)

# Needed to build old clang versions
CC=gcc-11
CCX=g++-11

# Targets
all: final

$(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR) $(DEPS_BIN_DIR):
	mkdir -p $(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR) $(DEPS_BIN_DIR)

# OCAML-WASM
libcamlrun: $(BUILD_DIR)/libcamlrun.a

$(BUILD_DIR)/libcamlrun.a: | $(BUILD_DIR)
	cd $(DEPS_DIR)/ocaml-wasm
	$(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc --disable-systhreads --disable-naked-pointers
	$(MAKE) -C runtime ocamlrun
	cp runtime/libcamlrun.a $(BUILD_DIR)

$(BUILD_DIR)/prims.o: | $(BUILD_DIR)
	(echo '#define CAML_INTERNALS'; \
			echo '#include <caml/mlvalues.h>'; \
	echo '#include <caml/prims.h>'; \
	sed -e 's/.*/extern value &();/' backend/wasm/primitives.txt; \
	echo 'c_primitive caml_builtin_cprim[] = {'; \
	sed -e 's/.*/	&,/' backend/wasm/primitives.txt; \
	echo '	 0 };'; \
	echo 'char * caml_names_of_builtin_cprim[] = {'; \
	sed -e 's/.*/	"&",/' backend/wasm/primitives.txt; \
	echo '	 0 };') > $(BUILD_DIR)/prims.c
	$(EMCC) -c -I $(OCAML_STDLIB) -o $(BUILD_DIR)/prims.o $(BUILD_DIR)/prims.c

# Build deps

deps: gmp mpfr camlidl gmp_caml stubs

gmp: $(LIBS_DIR)/libgmp.a

$(LIBS_DIR)/libgmp.a: $(DEPS_DIR)/gmp-6.1.2/configure | $(INSTALL_DIR)
	cd $(DEPS_DIR)/gmp-6.1.2
	$(EMCONFIGURE) ./configure \
		--disable-assembly \
		--host=none \
		--prefix=$(INSTALL_DIR)
	$(MAKE)
	$(MAKE) install

mpfr: $(LIBS_DIR)/libmpfr.a

$(LIBS_DIR)/libmpfr.a: $(DEPS_DIR)/mpfr-4.2.2/configure | $(INSTALL_DIR)
	cd $(DEPS_DIR)/mpfr-4.2.2
	touch aclocal.m4 configure
	find . -name "Makefile.in" -exec touch {} \;
	$(EMCONFIGURE) ./configure \
		--with-gmp=$(INSTALL_DIR) \
		--host=none \
		--prefix=$(INSTALL_DIR)
	$(MAKE)
	$(MAKE) install

camlidl: $(LIBS_DIR)/libcamlidl.a

$(LIBS_DIR)/libcamlidl.a: $(DEPS_DIR)/camlidl/runtime/idlalloc.c | $(INSTALL_DIR)
	$(EMCC) -fno-strict-aliasing -fwrapv -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/idlalloc.c -o $(BUILD_DIR)/idlalloc.o
	$(EMCC) -fno-strict-aliasing -fwrapv -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/comintf.c -o $(BUILD_DIR)/comintf.o
	$(EMCC) -fno-strict-aliasing -fwrapv -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/comerror.c -o $(BUILD_DIR)/comerror.o
	$(EMAR) rcs $(LIBS_DIR)/libcamlidl.a $(BUILD_DIR)/idlalloc.o $(BUILD_DIR)/comintf.o $(BUILD_DIR)/comerror.o
	mkdir -p $(INSTALL_DIR)/include/caml
	cp $(DEPS_DIR)/camlidl/runtime/camlidlruntime.h $(INSTALL_DIR)/include/caml

gmp_caml: $(LIBS_DIR)/libgmp_caml.a

MLGMPIDL_MODULES := gmp_caml mpz_caml mpq_caml mpf_caml mpfr_caml gmp_random_caml

$(LIBS_DIR)/libgmp_caml.a: gmp mpfr camlidl
	cd $(DEPS_DIR)/mlgmpidl
	$(EMCONFIGURE) ./configure \
		-prefix $(INSTALL_DIR) \
		-gmp-prefix $(INSTALL_DIR) \
		-mpfr-prefix $(INSTALL_DIR)
	$(MAKE) $(MLGMPIDL_MODULES:%=%.c)
	for module in $(MLGMPIDL_MODULES); do \
		$(EMCC) -c -I$(OCAML_STDLIB) -I$(INSTALL_DIR)/include $${module}.c -o $(BUILD_DIR)/$${module}.o; \
	done
	$(EMAR) rcs $(LIBS_DIR)/libgmp_caml.a $(addprefix $(BUILD_DIR)/,$(MLGMPIDL_MODULES:%=%.o))
	cp $(DEPS_DIR)/mlgmpidl/gmp_caml.h $(INSTALL_DIR)/include
	
	
STUB_LIBS := libpolkaMPQ_caml.a liboctMPQ_caml.a libboxMPQ_caml.a libapron_caml.a \
             libmopsa_c_parser_stubs.a libmopsa_utils_stubs.a libzarith.a \
             libpolkaMPQ.a liboctMPQ.a libboxMPQ.a libapron.a \
             libclang-cpp.a libclang.a libLLVM-19.a libunix.a libcamlstr.a

stubs: $(addprefix $(DEPS_BIN_DIR)/,$(STUB_LIBS))

$(DEPS_BIN_DIR)/lib%.a: backend/wasm/stubs/empty.o | $(DEPS_BIN_DIR)
	$(EMAR) rcs $@ $<

# Mopsa with deps

mopsa-bc: $(BUILD_DIR)/mopsa.bc

## For now we cp only
$(BUILD_DIR)/mopsa.bc:
	$(OPAM_EXEC) dune build backend/wasm/mopsa_worker.bc --profile release
	rm -f $(BUILD_DIR)/mopsa.bc
	cp _build/default/backend/wasm/mopsa_worker.bc $(BUILD_DIR)/mopsa.bc

# Build final binary
final: $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc $(BUILD_DIR)/prims.o deps
	$(EMCC) -Wall -g -fno-strict-aliasing -fwrapv \
	-ffunction-sections -o $(DIST_DIR)/ocamlrun.html \
	-s ENVIRONMENT='web' --preload-file $(BUILD_DIR)/mopsa.bc \
  -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS', 'run','callMain']" \
	--pre-js backend/wasm/pre.js -L$(LIBS_DIR) \
	$(DEPS_BIN_DIR)/*.a -lgmp -lmpfr \
	-s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128MB -s STACK_SIZE=5MB \
	-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s WARN_ON_UNDEFINED_SYMBOLS=1 \
	$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a

# Clean
clean: clean-mopsa clean-ocaml clean-project clean-gmp clean-mpfr

clean-project:
	dune clean
	rm -rf $(DIST_DIR) $(INSTALL_DIR) $(BUILD_DIR)

clean-ocaml:
	$(MAKE) -C $(DEPS_DIR)/ocaml-wasm clean

clean-mopsa:
	$(MAKE) -C $(DEPS_DIR)/mopsa-analyzer clean

clean-gmp:
	$(MAKE) -C $(DEPS_DIR)/gmp-6.1.2 clean

clean-mpfr:
	$(MAKE) -C $(DEPS_DIR)/mpfr-4.2.2 clean