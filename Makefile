# Dependencies: :
# - Ocaml 4.12.0
# - with mopsa pinned at deps/mopsa-analyzer
# - Docker (for building 32-bit bytecode)
#   - Build the image with: `docker build -t mopsa-emcc-32bc -f docker/Dockerfile.mopsa-32bc docker/`
# - Emscripten SDK
# - gcc-11 and g++-11 (for building old clang & ocaml versions)

CFLAGS := -Oz -DNDEBUG
CXXFLAGS := -Oz -DNDEBUG

EMCC_FLAGS := $(CFLAGS) -fno-strict-aliasing -fwrapv


.ONESHELL:

# Variables
INSTALL_DIR := $(CURDIR)/libs
LIBS_DIR := $(INSTALL_DIR)/lib
DIST_DIR := $(CURDIR)/dist
DEPS_DIR := $(CURDIR)/deps
BUILD_DIR := $(CURDIR)/build
DEPS_BIN_DIR := $(BUILD_DIR)/deps
LLVM_WASM_SRC     := $(DEPS_DIR)/llvm-project
LLVM_NATIVE_BUILD := $(LLVM_WASM_SRC)/build-native
LLVM_WASM_BUILD   := $(LLVM_WASM_SRC)/build-wasm
EMSDK_TOOLCHAIN   := /home/rboud/Documents/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake
EMSDK_SYSROOT     := /home/rboud/Documents/emsdk/upstream/emscripten/cache/sysroot
CLANG_TO_ML_SRC   := $(DEPS_DIR)/mopsa-analyzer/parsers/c/lib/parser/Clang_to_ml.cc

EMCC := emcc
EMCONFIGURE := emconfigure
EMCMAKE := emcmake
EMMAKE := emmake
EMAR := emar
OPAM_EXEC := opam exec --
NPM := pnpm
DOCKER := docker
DOCKER_IMAGE_32BC := mopsa-emcc-32bc

# Source of the OCaml bytecode embedded in the wasm build:
#   docker32 (default) : 32-bit bytecode built in a linux/386 container so that
#                        integer widths match the wasm32 runtime (31-bit ints).
#   native             : 64-bit bytecode built with the host opam switch below.
#                        Experimental: tests whether the 32-bit build is really
#                        required.  Use with `make MOPSA_BC_SRC=native ...`.
MOPSA_BC_SRC ?= docker32
NATIVE_SWITCH := 4.14.2
NATIVE_OPAM_EXEC := opam exec --switch=$(NATIVE_SWITCH) --
NATIVE_BUILD_DIR := $(CURDIR)/_build
MOPSA_SRC := $(DEPS_DIR)/mopsa-analyzer

FRONTEND_DIR := $(CURDIR)/frontend
LINUX32_INCLUDE_DIR := $(BUILD_DIR)/linux32-include

NPROC := $(shell nproc 2>/dev/null || echo 1)

OCAML_STDLIB := $(DEPS_DIR)/ocaml-wasm/runtime

# Needed to build old clang versions
CC=gcc-11
CCX=g++-11

# CAMLIDL config
CAMLIDL := $(shell opam var bin)/camlidl
PERL := /usr/bin/perl
CAMLIDL_CFLAGS := -I$(OCAML_STDLIB) -I$(shell opam var lib)/camlidl -I$(INSTALL_DIR)/include

# Phony targets
.PHONY: all wasm wasm-node wasm-web wasm-web-artifacts final-web frontend-build \
        deps gmp mpfr camlidl gmp_caml zarith apron apron_caml \
        mopsa_floats mopsa_primitives libcamlrun prims mopsa-bc mopsa-bc-native mopsa-install-native \
        llvm-tblgen clang-wasm clang_to_ml clang-resource-headers \
        docker-image-32bc mopsa-bc-32 extract-32-headers \
        jsoo-analyzer jsoo-web jsoo-web-native jsoo-web-docker \
        clean clean-project clean-ocaml clean-mopsa clean-gmp clean-mpfr clean-apron clean-llvm \
        clean-docker-32bc clean-jsoo

# Targets
all: final-web

$(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR) $(DEPS_BIN_DIR):
	mkdir -p $(INSTALL_DIR) $(LIBS_DIR) $(DIST_DIR) $(DEPS_DIR) $(BUILD_DIR) $(DEPS_BIN_DIR)

# OCAML-WASM
libcamlrun: $(BUILD_DIR)/libcamlrun.a

$(BUILD_DIR)/libcamlrun.a: | $(BUILD_DIR)
	cd $(DEPS_DIR)/ocaml-wasm
	CFLAGS="$(CFLAGS)" $(EMCONFIGURE) ./configure --disable-native-compiler --disable-ocamltest --disable-ocamldoc --disable-systhreads
	# OCaml 4.14 introduced runtime/sak, a build-time tool used to encode the
	# stdlib path as a C literal in build_config.h.  emconfigure would compile
	# it with emcc → .wasm, which can't be exec'd on the host, so the embedded
	# path silently becomes empty and the byterunner fails to compile.  Force a
	# host build of BOTH sak.o AND sak (and touch them) so make doesn't retry
	# with emcc on the dependency chain.
	rm -f runtime/sak runtime/sak.o runtime/sak.wasm
	cc -c -o runtime/sak.o runtime/sak.c
	cc -o runtime/sak runtime/sak.o
	touch runtime/sak.o runtime/sak
	CFLAGS="$(CFLAGS)" $(MAKE) -C runtime libcamlrun.a
	cp runtime/libcamlrun.a $(BUILD_DIR)
	
prims: $(BUILD_DIR)/prims.o

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
	$(EMCC) $(EMCC_FLAGS) -Wno-incompatible-function-pointer-types -c -I $(OCAML_STDLIB) -o $(BUILD_DIR)/prims.o $(BUILD_DIR)/prims.c

# Build deps
deps: gmp mpfr camlidl gmp_caml zarith apron apron_caml mopsa_floats mopsa_primitives clang_to_ml

gmp: $(LIBS_DIR)/libgmp.a

$(LIBS_DIR)/libgmp.a: $(DEPS_DIR)/gmp-6.1.2/configure | $(INSTALL_DIR)
	cd $(DEPS_DIR)/gmp-6.1.2
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(EMCONFIGURE) ./configure \
		--disable-assembly \
		--host=none \
		--enable-cxx \
		--prefix=$(INSTALL_DIR)
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(MAKE)
	$(MAKE) install

mpfr: $(LIBS_DIR)/libmpfr.a

$(LIBS_DIR)/libmpfr.a: $(DEPS_DIR)/mpfr-4.2.2/configure $(LIBS_DIR)/libgmp.a | $(INSTALL_DIR)
	cd $(DEPS_DIR)/mpfr-4.2.2
	touch aclocal.m4 configure
	find . -name "Makefile.in" -exec touch {} \;
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(EMCONFIGURE) ./configure \
		--with-gmp=$(INSTALL_DIR) \
		--host=none \
		--prefix=$(INSTALL_DIR)
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(MAKE)
	$(MAKE) install

camlidl: $(LIBS_DIR)/libcamlidl.a

$(LIBS_DIR)/libcamlidl.a: $(DEPS_DIR)/camlidl/runtime/idlalloc.c | $(INSTALL_DIR)
	$(EMCC) $(EMCC_FLAGS) -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/idlalloc.c -o $(BUILD_DIR)/idlalloc.o
	$(EMCC) $(EMCC_FLAGS) -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/comintf.c -o $(BUILD_DIR)/comintf.o
	$(EMCC) $(EMCC_FLAGS) -D_FILE_OFFSET_BITS=64 -D_REENTRANT -c -I$(OCAML_STDLIB) $(DEPS_DIR)/camlidl/runtime/comerror.c -o $(BUILD_DIR)/comerror.o
	$(EMAR) rcs $(LIBS_DIR)/libcamlidl.a $(BUILD_DIR)/idlalloc.o $(BUILD_DIR)/comintf.o $(BUILD_DIR)/comerror.o
	mkdir -p $(INSTALL_DIR)/include/caml
	cp $(DEPS_DIR)/camlidl/runtime/camlidlruntime.h $(INSTALL_DIR)/include/caml

gmp_caml: $(LIBS_DIR)/libgmp_caml.a

MLGMPIDL_MODULES := gmp_caml mpz_caml mpq_caml mpf_caml mpfr_caml gmp_random_caml

$(LIBS_DIR)/libgmp_caml.a: $(LIBS_DIR)/libgmp.a $(LIBS_DIR)/libmpfr.a $(LIBS_DIR)/libcamlidl.a
	cd $(DEPS_DIR)/mlgmpidl
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(EMCONFIGURE) ./configure \
		-prefix $(INSTALL_DIR) \
		-gmp-prefix $(INSTALL_DIR) \
		-mpfr-prefix $(INSTALL_DIR)
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(MAKE) $(MLGMPIDL_MODULES:%=%.c)
	for module in $(MLGMPIDL_MODULES); do \
		$(EMCC) $(EMCC_FLAGS) -c -I$(OCAML_STDLIB) -I$(INSTALL_DIR)/include $${module}.c -o $(BUILD_DIR)/$${module}.o; \
	done
	$(EMAR) rcs $(LIBS_DIR)/libgmp_caml.a $(addprefix $(BUILD_DIR)/,$(MLGMPIDL_MODULES:%=%.o))
	cp $(DEPS_DIR)/mlgmpidl/gmp_caml.h $(INSTALL_DIR)/include

zarith: $(LIBS_DIR)/libzarith.a

$(LIBS_DIR)/libzarith.a:
	$(EMCC) $(EMCC_FLAGS) -c -DHAS_GMP -I$(OCAML_STDLIB) -I$(INSTALL_DIR)/include $(DEPS_DIR)/Zarith/caml_z.c -o $(BUILD_DIR)/caml_z.o
	$(EMAR) rcs $(LIBS_DIR)/libzarith.a $(BUILD_DIR)/caml_z.o
	cp $(DEPS_DIR)/Zarith/zarith.h $(INSTALL_DIR)/include
	
apron: $(LIBS_DIR)/libapron.a
	
$(LIBS_DIR)/libapron.a: $(LIBS_DIR)/libgmp.a $(LIBS_DIR)/libmpfr.a
	cd $(DEPS_DIR)/apron
	MPFR_PREFIX=$(INSTALL_DIR) \
	GMP_PREFIX=$(INSTALL_DIR) \
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(EMCONFIGURE) ./configure \
		-no-java -no-cxx -no-ppl -no-pplite \
		-no-ocaml -no-strip \
		-prefix $(INSTALL_DIR) && \
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" $(MAKE)
	$(MAKE) install


apron_caml: $(DEPS_BIN_DIR)/libapron_caml.a $(DEPS_BIN_DIR)/libboxMPQ_caml.a \
            $(DEPS_BIN_DIR)/liboctMPQ_caml.a $(DEPS_BIN_DIR)/libpolkaMPQ_caml.a


MLAPRONIDL_IDL := scalar interval coeff dim linexpr0 lincons0 generator0 texpr0 tcons0 \
                  manager abstract0 var environment linexpr1 lincons1 generator1 texpr1 \
                  tcons1 abstract1 policy disjunction version
MLAPRONIDL_MODULES := $(MLAPRONIDL_IDL:%=%_caml) apron_caml

$(DEPS_BIN_DIR)/libapron_caml.a: $(LIBS_DIR)/libapron.a $(LIBS_DIR)/libcamlidl.a $(LIBS_DIR)/libgmp_caml.a | $(DEPS_BIN_DIR)
	$(MAKE) -C $(DEPS_DIR)/apron/mlapronidl CAMLIDL=$(CAMLIDL) PERL=$(PERL) $(MLAPRONIDL_IDL:%=%_caml.c)
	for module in $(MLAPRONIDL_MODULES); do \
		$(EMCC) $(EMCC_FLAGS) -c $(CAMLIDL_CFLAGS) -I$(DEPS_DIR)/apron/apron -I$(DEPS_DIR)/apron/mlapronidl \
			-o $(BUILD_DIR)/$${module}.o $(DEPS_DIR)/apron/mlapronidl/$${module}.c; \
	done
	$(EMAR) rcs $@ $(addprefix $(BUILD_DIR)/,$(MLAPRONIDL_MODULES:%=%.o))

$(DEPS_BIN_DIR)/libboxMPQ_caml.a: $(DEPS_BIN_DIR)/libapron_caml.a | $(DEPS_BIN_DIR)
	$(MAKE) -C $(DEPS_DIR)/apron/box CAMLIDL=$(CAMLIDL) PERL=$(PERL) box_caml.c
	$(EMCC) $(EMCC_FLAGS) -c $(CAMLIDL_CFLAGS) -I$(DEPS_DIR)/apron/apron -I$(DEPS_DIR)/apron/mlapronidl \
		-I$(DEPS_DIR)/apron/box -DNUM_MPQ \
		-o $(BUILD_DIR)/box_caml.o $(DEPS_DIR)/apron/box/box_caml.c
	$(EMAR) rcs $@ $(BUILD_DIR)/box_caml.o

$(DEPS_BIN_DIR)/liboctMPQ_caml.a: $(DEPS_BIN_DIR)/libapron_caml.a | $(DEPS_BIN_DIR)
	$(MAKE) -C $(DEPS_DIR)/apron/octagons CAMLIDL=$(CAMLIDL) PERL=$(PERL) oct_caml.c
	$(EMCC) $(EMCC_FLAGS) -c $(CAMLIDL_CFLAGS) -I$(DEPS_DIR)/apron/apron -I$(DEPS_DIR)/apron/mlapronidl \
		-I$(DEPS_DIR)/apron/octagons -DNUM_MPQ \
		-o $(BUILD_DIR)/oct_caml.o $(DEPS_DIR)/apron/octagons/oct_caml.c
	$(EMAR) rcs $@ $(BUILD_DIR)/oct_caml.o

$(DEPS_BIN_DIR)/libpolkaMPQ_caml.a: $(DEPS_BIN_DIR)/libapron_caml.a | $(DEPS_BIN_DIR)
	$(MAKE) -C $(DEPS_DIR)/apron/newpolka CAMLIDL=$(CAMLIDL) PERL=$(PERL) polka_caml.c
	$(EMCC) $(EMCC_FLAGS) -c $(CAMLIDL_CFLAGS) -I$(DEPS_DIR)/apron/apron -I$(DEPS_DIR)/apron/mlapronidl \
		-I$(DEPS_DIR)/apron/newpolka -DNUM_MPQ \
		-o $(BUILD_DIR)/polka_caml.o $(DEPS_DIR)/apron/newpolka/polka_caml.c
	$(EMAR) rcs $@ $(BUILD_DIR)/polka_caml.o

mopsa_floats: $(DEPS_BIN_DIR)/mopsa_floats.a

$(DEPS_BIN_DIR)/mopsa_floats.a:
	$(EMCC) $(EMCC_FLAGS) -c -I$(OCAML_STDLIB) -o $(BUILD_DIR)/floats_round.o $(DEPS_DIR)/mopsa-analyzer/utils/itvUtils/floats_round.c
	$(EMAR) rcs $@ $(BUILD_DIR)/floats_round.o

# Library primitives that mopsa.bc references at link time (unix + regex).
# These are extracted from Vincent Chan's old OCaml wasm fork (originally part
# of his runtime patches).  Kept here as standalone TUs rather than patches to
# the OCaml runtime: keeps deps/ocaml-wasm minimal, easier to upgrade later.
# systhreads/integers/ctypes/core_kernel were also in his fork but mopsa.bc
# never references their primitives (verified via `strings build/mopsa.bc`).
PRIMS_DIR := $(DEPS_DIR)/primitives
PRIMS_SOURCES := $(wildcard $(PRIMS_DIR)/unix/*.c) $(wildcard $(PRIMS_DIR)/str/*.c)
PRIMS_OBJECTS := $(patsubst $(PRIMS_DIR)/%.c,$(BUILD_DIR)/primitives/%.o,$(PRIMS_SOURCES))

mopsa_primitives: $(DEPS_BIN_DIR)/libmopsa_primitives.a

$(BUILD_DIR)/primitives/%.o: $(PRIMS_DIR)/%.c | $(BUILD_DIR)
	mkdir -p $(dir $@)
	$(EMCC) $(EMCC_FLAGS) -DHAS_REALPATH -c -I$(OCAML_STDLIB) -I$(PRIMS_DIR)/unix -o $@ $<

$(DEPS_BIN_DIR)/libmopsa_primitives.a: $(PRIMS_OBJECTS) | $(DEPS_BIN_DIR)
	$(EMAR) rcs $@ $(PRIMS_OBJECTS)

# Apron FPU override: silences the spurious "platform not supported" warning.
# NUM_MPQ domains use exact GMP arithmetic, so no hardware rounding is needed.
$(BUILD_DIR)/ap_fpu_wasm.o: backend/wasm/ap_fpu_wasm.c
	$(EMCC) $(EMCC_FLAGS) -c -o $@ $<

# LLVM/Clang wasm build

llvm-tblgen: $(LLVM_NATIVE_BUILD)/bin/llvm-tblgen

$(LLVM_NATIVE_BUILD)/bin/llvm-tblgen: | $(LLVM_WASM_SRC)
	cmake -G Ninja -S $(LLVM_WASM_SRC)/llvm -B $(LLVM_NATIVE_BUILD) \
	  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
	  -DCMAKE_C_COMPILER=$(CC) \
	  -DCMAKE_CXX_COMPILER=$(CCX) \
	  -DLLVM_ENABLE_PROJECTS=clang \
	  -DLLVM_TARGETS_TO_BUILD=host \
	  -DCMAKE_BUILD_TYPE=Release \
	  -DLLVM_BUILD_TOOLS=OFF \
	  -DLLVM_INCLUDE_TESTS=OFF \
	  -DLLVM_INCLUDE_EXAMPLES=OFF \
	  -DLLVM_BUILD_EXAMPLES=OFF \
	  -DLLVM_INCLUDE_BENCHMARKS=OFF \
	  -DLLVM_ENABLE_ZLIB=OFF \
	  -DLLVM_ENABLE_TERMINFO=OFF
	ninja -C $(LLVM_NATIVE_BUILD) -j$(NPROC) llvm-tblgen clang-tblgen

clang-wasm: $(LLVM_WASM_BUILD)/lib/libclangFrontend.a

$(LLVM_WASM_BUILD)/lib/libclangFrontend.a: $(LLVM_NATIVE_BUILD)/bin/llvm-tblgen
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" cmake -G Ninja -S $(LLVM_WASM_SRC)/llvm -B $(LLVM_WASM_BUILD) \
	  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
	  -DCMAKE_TOOLCHAIN_FILE=$(EMSDK_TOOLCHAIN) \
	  -DLLVM_TABLEGEN=$(LLVM_NATIVE_BUILD)/bin/llvm-tblgen \
	  -DCLANG_TABLEGEN=$(LLVM_NATIVE_BUILD)/bin/clang-tblgen \
	  -DLLVM_ENABLE_PROJECTS=clang \
	  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
	  -DCMAKE_BUILD_TYPE=Release \
	  -DLLVM_DEFAULT_TARGET_TRIPLE=wasm32-unknown-emscripten \
	  -DLLVM_HOST_TRIPLE=wasm32-unknown-emscripten \
	  -DLLVM_ENABLE_THREADS=OFF \
	  -DLLVM_ENABLE_ZLIB=OFF \
	  -DLLVM_ENABLE_TERMINFO=OFF \
	  -DLLVM_ENABLE_LIBEDIT=OFF \
	  -DLLVM_ENABLE_LIBXML2=OFF \
	  -DLLVM_ENABLE_ASSERTIONS=OFF \
	  -DLLVM_ENABLE_EH=OFF \
	  -DLLVM_ENABLE_RTTI=OFF \
	  -DLLVM_BUILD_TOOLS=OFF \
	  -DLLVM_INCLUDE_TESTS=OFF \
	  -DLLVM_INCLUDE_EXAMPLES=OFF \
	  -DLLVM_BUILD_EXAMPLES=OFF \
	  -DLLVM_INCLUDE_BENCHMARKS=OFF \
	  -DCLANG_BUILD_TOOLS=OFF \
	  -DCLANG_INCLUDE_TESTS=OFF \
	  -DCMAKE_INSTALL_PREFIX=$(INSTALL_DIR)
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" ninja -C $(LLVM_WASM_BUILD) -j$(NPROC) \
	  clangFrontend clangParse clangAST clangLex clangBasic \
	  clangSema clangDriver clangEdit clangSerialization \
	  clangAnalysis clangStaticAnalyzerCore \
	  LLVMSupport LLVMCore LLVMMC LLVMMCParser \
	  LLVMBinaryFormat LLVMBitReader LLVMBitstreamReader \
	  LLVMOption LLVMProfileData LLVMDemangle LLVMRemarks

clang-resource-headers: $(INSTALL_DIR)/lib/clang/9.0.1/include/stddef.h

$(INSTALL_DIR)/lib/clang/9.0.1/include/stddef.h: $(LLVM_WASM_BUILD)/lib/libclangFrontend.a
	CFLAGS="$(CFLAGS)" CXXFLAGS="$(CXXFLAGS)" ninja -C $(LLVM_WASM_BUILD) install-clang-resource-headers

clang_to_ml: $(DEPS_BIN_DIR)/libmopsa_c_parser.a

$(DEPS_BIN_DIR)/libmopsa_c_parser.a: $(CLANG_TO_ML_SRC) $(LLVM_WASM_BUILD)/lib/libclangFrontend.a $(INSTALL_DIR)/lib/clang/9.0.1/include/stddef.h | $(DEPS_BIN_DIR)
	em++ -std=c++14 \
	  -I$(LLVM_WASM_SRC)/llvm/include \
	  -I$(LLVM_WASM_SRC)/clang/include \
	  -I$(LLVM_WASM_BUILD)/include \
	  -I$(LLVM_WASM_BUILD)/tools/clang/include \
	  -I$(OCAML_STDLIB) \
	  -DCLANGRESOURCE=\"/clang-headers\" \
	  -fno-rtti \
	  -fno-exceptions \
	  -c $(CLANG_TO_ML_SRC) \
	  -o $(BUILD_DIR)/clang_to_ml.o \
	  $(CXXFLAGS)
	$(EMAR) rcs $@ $(BUILD_DIR)/clang_to_ml.o
	cp $(LLVM_WASM_BUILD)/lib/libclang*.a $(DEPS_BIN_DIR)/
	cp $(LLVM_WASM_BUILD)/lib/libLLVM*.a  $(DEPS_BIN_DIR)/

# Mopsa with deps

mopsa-bc: $(BUILD_DIR)/mopsa.bc

# mopsa.bc is assembled from either the 32-bit Docker build (default) or the
# native 64-bit host build, selected by MOPSA_BC_SRC.
ifeq ($(MOPSA_BC_SRC),native)
$(BUILD_DIR)/mopsa.bc: $(BUILD_DIR)/mopsa-native.bc
	cp -f $(BUILD_DIR)/mopsa-native.bc $(BUILD_DIR)/mopsa.bc
else
$(BUILD_DIR)/mopsa.bc: $(BUILD_DIR)/mopsa-32.bc
	cp -f $(BUILD_DIR)/mopsa-32.bc $(BUILD_DIR)/mopsa.bc
endif

# Build + install the patched mopsa from the local submodule into the native
# opam switch, so mopsa-native.bc links the up-to-date analyzer (incl. the
# cpython/lvalue_ref fixes).  configure bakes the host clang path into the C
# parser's dune, so this REQUIRES a mopsa-compatible host clang (<= 19) to
# compile the native Clang_to_ml.cc stub.  Mirrors what the Docker build does.
mopsa-install-native:
	cd $(MOPSA_SRC) && $(NATIVE_OPAM_EXEC) ./configure
	$(NATIVE_OPAM_EXEC) dune build --root $(MOPSA_SRC) @install --profile release
	$(NATIVE_OPAM_EXEC) dune install --root $(MOPSA_SRC) mopsa \
		--prefix=$$($(NATIVE_OPAM_EXEC) opam var prefix) --profile release
	rm -f $(BUILD_DIR)/mopsa-native.bc

# Native 64-bit bytecode, built with the host opam switch (no Docker).
# Links against the mopsa libraries installed in the $(NATIVE_SWITCH) switch
# (run `make mopsa-install-native` first to refresh them from local sources).
mopsa-bc-native: $(BUILD_DIR)/mopsa-native.bc

$(BUILD_DIR)/mopsa-native.bc: | $(BUILD_DIR)
	$(NATIVE_OPAM_EXEC) dune build \
		--build-dir=$(NATIVE_BUILD_DIR) \
		backend/wasm/mopsa_worker.bc \
		--profile release
	cp -f $(NATIVE_BUILD_DIR)/default/backend/wasm/mopsa_worker.bc $@

# 32-bit bytecode via Docker (for wasm32 targets where int width matters)
# Uses a linux/386 container so the OCaml runtime compiles with 31-bit ints.
# The resulting mopsa-32.bc is used in place of mopsa.bc for wasm32 builds.
docker-image-32bc: $(BUILD_DIR)/.docker-32bc-stamp

$(BUILD_DIR)/.docker-32bc-stamp: docker/Dockerfile.mopsa-32bc | $(BUILD_DIR)
	DOCKER_BUILDKIT=1 $(DOCKER) build \
		--platform linux/386 \
		-t $(DOCKER_IMAGE_32BC) \
		-f docker/Dockerfile.mopsa-32bc \
		docker/
	touch $@

mopsa-bc-32: $(BUILD_DIR)/mopsa-32.bc

$(BUILD_DIR)/mopsa-32.bc: $(BUILD_DIR)/.docker-32bc-stamp | $(BUILD_DIR)
	$(DOCKER) run --rm \
		--platform linux/386 \
		-v $(CURDIR):/workspace \
		-v mopsa-emcc-opam-32:/root/.opam \
		$(DOCKER_IMAGE_32BC) \
		bash /workspace/docker/build-mopsa-32bc.sh

clean-docker-32bc:
	$(DOCKER) rmi -f $(DOCKER_IMAGE_32BC) 2>/dev/null || true
	$(DOCKER) volume rm mopsa-emcc-opam-32 2>/dev/null || true
	rm -f $(BUILD_DIR)/.docker-32bc-stamp $(BUILD_DIR)/mopsa-32.bc

# Extract 32-bit Linux system headers from the Docker image.
extract-32-headers: $(BUILD_DIR)/.linux32-headers-stamp

$(BUILD_DIR)/.linux32-headers-stamp: $(BUILD_DIR)/.docker-32bc-stamp | $(BUILD_DIR)
	mkdir -p $(LINUX32_INCLUDE_DIR)
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE_32BC) \
		sh -c 'cd /usr/include && tar -c \
			$$(find . -maxdepth 1 -name "*.h") \
			asm-generic arpa netinet net linux' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE_32BC) \
		sh -c 'cd /usr/include/i386-linux-gnu && tar -c \
			$$(find . -maxdepth 1 -name "*.h") \
			bits sys gnu asm' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	# CPython headers (Python.h, pyport.h, ...) come from the 32-bit image too,
	# flattened into the include root.  The find keeps this robust to the Python
	# version shipped by the base image.
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE_32BC) \
		sh -c 'cd "$$(dirname $$(find /usr/include -name Python.h | head -1))" && tar -c .' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	# Debian ships pyconfig.h as a multiarch wrapper that #includes the real
	# <i386-linux-gnu/python3.11/pyconfig.h> guarded by __i386__.  But Mopsa's C
	# frontend does not target i386 (hence the benign 'regparm' warnings), so
	# that branch is not taken and the real file lives in a subdir we don't
	# flatten.  Resolve the wrapper here by overwriting the flattened pyconfig.h
	# with the real i386 variant, so SIZEOF_LONG/SIZEOF_VOID_P (4) match the
	# glibc 32-bit data model and pyport.h's LONG_BIT == 8*SIZEOF_LONG holds.
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE_32BC) \
		sh -c 'cat "$$(find /usr/include -path "*i386-linux-gnu/python*/pyconfig.h" | head -1)"' \
		> $(LINUX32_INCLUDE_DIR)/pyconfig.h
	touch $@

# Build final wasm binary (browser HTML harness)
wasm: $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc $(BUILD_DIR)/prims.o deps $(BUILD_DIR)/ap_fpu_wasm.o | $(DIST_DIR)
	$(EMCC) -Wall -Oz -fno-strict-aliasing -fwrapv \
	-ffunction-sections -o $(DIST_DIR)/ocamlrun.html \
	-s ENVIRONMENT='web' --preload-file $(BUILD_DIR)/mopsa.bc \
	--preload-file $(INSTALL_DIR)/lib/clang/9.0.1/include@/clang-headers/include \
	-s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS', 'run','callMain']" \
	--pre-js backend/wasm/pre.js --post-js backend/wasm/post.js -L$(LIBS_DIR) \
	-Wl,--wrap=ap_fpu_init $(BUILD_DIR)/ap_fpu_wasm.o \
	$(DEPS_BIN_DIR)/*.a $(LIBS_DIR)/*.a \
	-s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128MB -s STACK_SIZE=5MB \
	-s ASSERTIONS=2 \
	-s ERROR_ON_UNDEFINED_SYMBOLS=1 \
	$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a

# Build wasm binary for Node.js (run as: node ocamlrun.js mopsa.bc)
wasm-node: $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc $(BUILD_DIR)/prims.o deps $(BUILD_DIR)/ap_fpu_wasm.o | $(DIST_DIR)
	$(EMCC) -Wall -Oz -fno-strict-aliasing -fwrapv \
	-ffunction-sections -o $(DIST_DIR)/ocamlrun.js \
	-s ENVIRONMENT='node' --preload-file $(BUILD_DIR)/mopsa.bc@mopsa.bc \
	--preload-file $(INSTALL_DIR)/lib/clang/9.0.1/include@/clang-headers/include \
	-s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS', 'run','callMain']" \
	--post-js backend/wasm/post.js -L$(LIBS_DIR) \
	-Wl,--wrap=ap_fpu_init $(BUILD_DIR)/ap_fpu_wasm.o \
	$(DEPS_BIN_DIR)/*.a $(LIBS_DIR)/*.a \
	-s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128MB -s STACK_SIZE=5MB \
	-s ASSERTIONS=2 \
	-s ERROR_ON_UNDEFINED_SYMBOLS=1 \
	$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a

# Build the WASM backend artifacts and copy them into frontend/public/.
# Requires: make deps && make mopsa-bc (builds the OCaml bytecode via Docker)
#
# MODULARIZE exposes createMopsaModule() so the JS wrapper (mopsa_api.js)
# can create a fresh WASM instance per analysis.  This avoids Asyncify which
# is incompatible with OCaml's setjmp/longjmp-based exception mechanism.
#
# The mopsa share directory is preloaded at /share/mopsa so C/Python stubs
# are available to Mopsa inside the virtual filesystem.
wasm-web-artifacts: $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/mopsa.bc $(BUILD_DIR)/prims.o deps $(BUILD_DIR)/.linux32-headers-stamp $(BUILD_DIR)/ap_fpu_wasm.o | $(DIST_DIR)
	$(EMCC) -Wall -Oz -fno-strict-aliasing -fwrapv \
	-ffunction-sections -o $(DIST_DIR)/ocamlrun.js \
	-s ENVIRONMENT='web' \
	-s MODULARIZE=1 \
	-s EXPORT_NAME='createMopsaModule' \
	--preload-file $(BUILD_DIR)/mopsa.bc@/build/mopsa.bc \
	--preload-file $(INSTALL_DIR)/lib/clang/9.0.1/include@/clang-headers/include \
	--preload-file $(LINUX32_INCLUDE_DIR)@/usr/include \
	--preload-file $(DEPS_DIR)/mopsa-analyzer/share/mopsa@/share/mopsa \
	-s EXPORTED_RUNTIME_METHODS="['FS','ENV']" \
	--pre-js backend/wasm/pre.js --post-js backend/wasm/post.js -L$(LIBS_DIR) \
	-Wl,--wrap=ap_fpu_init $(BUILD_DIR)/ap_fpu_wasm.o \
	$(DEPS_BIN_DIR)/*.a $(LIBS_DIR)/*.a \
	-s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128MB -s STACK_SIZE=5MB \
	-s ASSERTIONS=0 \
	-s ERROR_ON_UNDEFINED_SYMBOLS=1 \
	$(BUILD_DIR)/prims.o $(BUILD_DIR)/libcamlrun.a
	cp $(DIST_DIR)/ocamlrun.js   $(FRONTEND_DIR)/public/
	cp $(DIST_DIR)/ocamlrun.wasm $(FRONTEND_DIR)/public/
	cp $(DIST_DIR)/ocamlrun.data $(FRONTEND_DIR)/public/
	cp backend/wasm/mopsa_api.js    $(FRONTEND_DIR)/public/
	cp backend/wasm/mopsa_worker.js $(FRONTEND_DIR)/public/

frontend-build:
	cd $(FRONTEND_DIR) && $(NPM) install && $(NPM) exec vite build

# Frontend with the WASM backend only
wasm-web: wasm-web-artifacts
	$(MAKE) frontend-build

# Frontend with both backends (WASM + jsoo)
final-web: wasm-web-artifacts jsoo-web
	$(MAKE) frontend-build

# ── jsoo backend ─────────────────────────────────────────────────────────────
# The whole analyzer compiled to plain JavaScript with js_of_ocaml, as a
# lighter (feature-reduced) alternative to the WASM backend: no C /
# cross-language analysis (Clang is C++) and no Apron relational domains
# (C library; load-time primitives are stubbed in backend/jsoo/runtime_stubs.js).
#
# Note: jsoo-analyzer reconfigures deps/mopsa-analyzer with --disable-c.
# The docker32 / native wasm targets re-run ./configure themselves, so this
# does not corrupt them; just be aware the submodule's analyzer/dune changes.
JSOO_SWITCH := 4.14.2
JSOO_OPAM_EXEC := opam exec --switch=$(JSOO_SWITCH) --
MOPSA_INSTALL_TREE := $(MOPSA_SRC)/_build/install/default/lib

# Source of the jsoo worker:
#   docker (default) : built inside the 32-bit container (mopsa-emcc-32bc),
#                      sharing the switch and opam cache volume with the wasm
#                      bytecode build.  Requires only Docker on the host.
#   native           : built with the host opam switch below.  Fast on
#                      subsequent runs, but needs the switch configured (see
#                      "Native build" in README.md).  Use with
#                      `make JSOO_SRC=native ...`.
JSOO_SRC ?= docker
JSOO_SWITCH := 4.14.2
JSOO_OPAM_EXEC := opam exec --switch=$(JSOO_SWITCH) --
MOPSA_INSTALL_TREE := $(MOPSA_SRC)/_build/install/default/lib

# Native path: reconfigure the submodule with --disable-c and build its
# dune install tree in-place, then compile the worker against it.
jsoo-analyzer:
	cd $(MOPSA_SRC) && $(JSOO_OPAM_EXEC) ./configure --disable-c
	# `dune build --only-packages mopsa` populates _build/install/default/
	# with the full library tree (cmi/cma/META/dune-package for every mopsa
	# sub-library).  It ultimately errors out on the Clang C stub parser —
	# recent host clang headers reject it — but the failure happens after
	# every jsoo-relevant artefact has been produced, so we ignore the
	# non-zero exit and just re-run the dune-package target to guarantee
	# it is up to date.  Consumed via OCAMLPATH; nothing is installed in
	# the opam switch.
	-$(JSOO_OPAM_EXEC) dune build --root $(MOPSA_SRC) --profile release \
		--only-packages mopsa
	$(JSOO_OPAM_EXEC) dune build --root $(MOPSA_SRC) --profile release \
		_build/install/default/lib/mopsa/dune-package

jsoo-web-native: jsoo-analyzer | $(BUILD_DIR)
	OCAMLPATH=$(MOPSA_INSTALL_TREE) $(JSOO_OPAM_EXEC) dune build backend/jsoo/mopsa_worker.bc.js
	cp -f _build/default/backend/jsoo/mopsa_worker.bc.js $(BUILD_DIR)/mopsa_worker_jsoo.js

# Docker path: reuses the mopsa-emcc-32bc image + mopsa-emcc-opam-32 volume
# from the wasm bytecode build.  Analyzer configure/build happens in /tmp
# inside the container (host submodule left untouched).
jsoo-web-docker: $(BUILD_DIR)/.docker-32bc-stamp | $(BUILD_DIR)
	$(DOCKER) run --rm \
		--platform linux/386 \
		-v $(CURDIR):/workspace \
		-v mopsa-emcc-opam-32:/root/.opam \
		$(DOCKER_IMAGE_32BC) \
		bash /workspace/docker/build-jsoo-web.sh

# Assemble the jsoo worker + api + share.json into frontend/public/.
# JSOO_SRC picks how the worker JS is produced (docker default, native opt-in).
ifeq ($(JSOO_SRC),native)
jsoo-web: jsoo-web-native
else
jsoo-web: jsoo-web-docker
endif
	cp -f $(BUILD_DIR)/mopsa_worker_jsoo.js $(FRONTEND_DIR)/public/mopsa_worker_jsoo.js
	cp -f backend/jsoo/mopsa_api.js $(FRONTEND_DIR)/public/mopsa_api_jsoo.js
	cd $(FRONTEND_DIR) && ./generateShareJson.sh

clean-jsoo:
	rm -f $(BUILD_DIR)/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_api_jsoo.js

# Clean
clean: clean-mopsa clean-ocaml clean-project clean-gmp clean-mpfr clean-apron clean-llvm

clean-project:
	dune clean
	rm -rf $(DIST_DIR) $(INSTALL_DIR) $(BUILD_DIR)

clean-ocaml:
	$(MAKE) -C $(DEPS_DIR)/ocaml-wasm clean
	rm -f $(BUILD_DIR)/libcamlrun.a $(BUILD_DIR)/prims.o

clean-mopsa:
	$(MAKE) -C $(DEPS_DIR)/mopsa-analyzer clean
	rm -f $(BUILD_DIR)/mopsa.bc

clean-gmp:
	$(MAKE) -C $(DEPS_DIR)/gmp-6.1.2 clean
	rm -f $(LIBS_DIR)/libgmp.a

clean-mpfr:
	$(MAKE) -C $(DEPS_DIR)/mpfr-4.2.2 clean
	rm -f $(LIBS_DIR)/libmpfr.a

clean-apron:
	$(MAKE) -C $(DEPS_DIR)/apron clean
	rm -f $(LIBS_DIR)/libapron.a $(LIBS_DIR)/libpolka_caml.a $(LIBS_DIR)/libboxMPQ.a $(LIBS_DIR)/liboctMPQ.a

clean-llvm:
	rm -rf $(LLVM_NATIVE_BUILD) $(LLVM_WASM_BUILD)
	rm -f $(DEPS_BIN_DIR)/libclang*.a $(DEPS_BIN_DIR)/libLLVM*.a $(DEPS_BIN_DIR)/libmopsa_c_parser.a
