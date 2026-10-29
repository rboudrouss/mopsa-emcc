# Dependencies:
# - OCaml 4.14.2 opam switch ($(SWITCH)), where mopsa is pinned to the 32-bit fork
#   (`make mopsa-install`; the C parser needs a host clang + llvm-dev)
# - ocaml-emcc (https://github.com/rboudrouss/ocaml-emcc), with cmake for its clang recipe
# - Emscripten SDK (emcc in PATH)
# - js_of_ocaml, js_of_ocaml-ppx, zarith_stubs_js, vpl-core in the switch (jsoo worker)
#   The switch and these opam packages are created / installed when missing
#   (`make deps` installs them all at once).
# - Docker (32-bit Linux headers)
#   - `make docker-image`, run by the web build

.ONESHELL:

# Variables
DIST_DIR := $(CURDIR)/dist
BUILD_DIR := $(CURDIR)/build
FRONTEND_DIR := $(CURDIR)/frontend
LINUX32_INCLUDE_DIR := $(BUILD_DIR)/linux32-include

NPM := pnpm
DOCKER := docker
DOCKER_IMAGE := mopsa-emcc-linux32

# opam switch holding mopsa and its dependencies.  ocaml-emcc builds its wasm
# runtime and C libraries in $(SWITCH_PREFIX)/emcc-sysroot.
SWITCH ?= 4.14.2
# Compiler of the switch when it is created
OCAML_VERSION ?= 4.14.2
OPAM_EXEC := opam exec --switch=$(SWITCH) --
# Also defined for a named switch that does not exist yet ($(OPAMROOT)/$(SWITCH))
SWITCH_PREFIX := $(shell opam var --switch=$(SWITCH) prefix 2>/dev/null)
SWITCH_CONFIG := $(SWITCH_PREFIX)/.opam-switch/switch-config
OCAML_EMCC ?= ocaml-emcc
OCAML_EMCC_REPO ?= https://github.com/rboudrouss/ocaml-emcc.git
# Extra options of `ocaml-emcc build` (e.g. `-O -Oz`, `--stack-size 16MB`)
OCAML_EMCC_FLAGS ?=

# Mopsa is pinned to the 32-bit fork until its 31-bit fixes are merged upstream.
MOPSA_REPO ?= https://gitlab.com/rboudrouss/mopsa-analyzer-32-bit.git
MOPSA_BRANCH ?= main
# Build directory of mopsa kept by opam (OPAMKEEPBUILDDIR): its configured
# sources, from which ocaml-emcc rebuilds the C stubs and the jsoo worker is built
MOPSA_KEPT_SRC = $(SWITCH_PREFIX)/.opam-switch/build/mopsa.$$(opam var --switch=$(SWITCH) mopsa:version)

# Phony targets
.PHONY: all wasm wasm-node wasm-web wasm-web-artifacts final-web frontend-build \
        deps switch mopsa-install mopsa-update ocaml-emcc-install jsoo-deps \
        docker-image extract-32-headers \
        jsoo-analyzer jsoo-worker jsoo-web \
        clean clean-project clean-docker clean-jsoo

# Targets
all: final-web

$(DIST_DIR) $(BUILD_DIR):
	mkdir -p $@

# ── opam switch ──────────────────────────────────────────────────────────────
# Every opam dependency of both backends
deps: mopsa-install ocaml-emcc-install jsoo-deps

switch: $(SWITCH_CONFIG)

# Create a missing switch (that of the wasm backend or the jsoo one), without
# selecting it
%/.opam-switch/switch-config:
	opam switch create $(notdir $*) ocaml-base-compiler.$(OCAML_VERSION) --no-switch -y

# ── Mopsa ────────────────────────────────────────────────────────────────────
# Installed in the switch with opam, natively: ocaml-emcc rebuilds its C stubs
# (the C parser against its own clang 9) from the build directory opam keeps.
MOPSA_META := $(SWITCH_PREFIX)/lib/mopsa/META

mopsa-install: $(MOPSA_META)

$(MOPSA_META): | $(SWITCH_CONFIG)
	opam pin add --switch=$(SWITCH) -y --no-action mopsa "git+$(MOPSA_REPO)#$(MOPSA_BRANCH)"
	OPAMKEEPBUILDDIR=true opam install --switch=$(SWITCH) -y mopsa

# Rebuild mopsa from the latest commit of $(MOPSA_BRANCH)
mopsa-update:
	opam update --switch=$(SWITCH) mopsa
	OPAMKEEPBUILDDIR=true opam upgrade --switch=$(SWITCH) -y mopsa

# ── ocaml-emcc ───────────────────────────────────────────────────────────────
# Pinned in the switch when OCAML_EMCC is left to `ocaml-emcc` and none is in PATH
ifeq ($(OCAML_EMCC)$(shell command -v ocaml-emcc),ocaml-emcc)
OCAML_EMCC_DEP := $(SWITCH_PREFIX)/bin/ocaml-emcc
endif

ocaml-emcc-install: $(OCAML_EMCC_DEP)

$(SWITCH_PREFIX)/bin/ocaml-emcc: | $(SWITCH_CONFIG)
	opam pin add --switch=$(SWITCH) -y ocaml-emcc "git+$(OCAML_EMCC_REPO)"

# ── WASM backend (ocaml-emcc) ────────────────────────────────────────────────
# ocaml-emcc builds the wasm ocamlrun, the C libraries (gmp, mpfr, apron, clang 9:
# ocaml-emcc.conf and emcc-recipes/) and the C stubs of every library linked in
# backend/wasm/mopsa_worker.bc, then links them with the bytecode.
OCAML_EMCC_BUILD = $(OPAM_EXEC) $(OCAML_EMCC) build $(1) --exe backend/wasm/mopsa_worker $(OCAML_EMCC_FLAGS)

# Clang's resource headers, found by the C parser at the resource directory of
# the host clang that mopsa was configured with (baked into its dune file).
CLANG_RESOURCE_DIR = $$(sed -n 's|.*(echo "\(/[^"]*\)").*|\1|p' $(MOPSA_KEPT_SRC)/parsers/c/lib/parser/dune)
CLANG_HEADERS = $$($(OPAM_EXEC) $(OCAML_EMCC) env --sysroot)/lib/clang/9.0.1/include
MOPSA_SHARE := $(SWITCH_PREFIX)/share/mopsa

# Same flags as the frontend expects: FS/ENV for the worker, pre.js/post.js
WASM_EMCC_FLAGS := -sEXPORTED_RUNTIME_METHODS=FS,ENV \
	--pre-js backend/wasm/pre.js --post-js backend/wasm/post.js

# Standalone browser build (HTML harness)
wasm: $(MOPSA_META) $(OCAML_EMCC_DEP) | $(DIST_DIR)
	$(call OCAML_EMCC_BUILD,$(DIST_DIR)/ocamlrun.html) --preload -- \
		-sENVIRONMENT=web $(WASM_EMCC_FLAGS) \
		--preload-file $(MOPSA_SHARE)@/share/mopsa \
		--preload-file $(CLANG_HEADERS)@$(CLANG_RESOURCE_DIR)/include

# Node.js build on the real file system, run like the native mopsa:
#   node dist/node/mopsa.js -share-dir=$(MOPSA_SHARE) -target-triple=x86_64-pc-linux-gnu \
#     -I <sysroot>/lib/clang/9.0.1/include -I /usr/include/x86_64-linux-gnu -I /usr/include ...
# (the C parser's resource directory is the host clang's, whose headers are newer)
wasm-node: $(MOPSA_META) $(OCAML_EMCC_DEP)
	mkdir -p $(DIST_DIR)/node
	$(call OCAML_EMCC_BUILD,$(DIST_DIR)/node/mopsa.js) --node-fs

# Build the WASM backend artifacts and copy them into frontend/public/.
#
# MODULARIZE exposes createMopsaModule() so the JS wrapper (mopsa_api.js)
# can create a fresh WASM instance per analysis.  This avoids Asyncify which
# is incompatible with OCaml's setjmp/longjmp-based exception mechanism.
#
# ocamlrun.data holds the bytecode, Mopsa's share directory (C/Python stubs)
# at /share/mopsa, clang's resource headers and the 32-bit Linux headers.
wasm-web-artifacts: $(MOPSA_META) $(OCAML_EMCC_DEP) $(BUILD_DIR)/.linux32-headers-stamp | $(DIST_DIR)
	$(call OCAML_EMCC_BUILD,$(DIST_DIR)/ocamlrun.js) --preload -- \
		-sENVIRONMENT=web -sMODULARIZE=1 -sEXPORT_NAME=createMopsaModule \
		$(WASM_EMCC_FLAGS) \
		--preload-file $(MOPSA_SHARE)@/share/mopsa \
		--preload-file $(CLANG_HEADERS)@$(CLANG_RESOURCE_DIR)/include \
		--preload-file $(LINUX32_INCLUDE_DIR)@/usr/include
	cp $(DIST_DIR)/ocamlrun.js   $(FRONTEND_DIR)/public/
	cp $(DIST_DIR)/ocamlrun.wasm $(FRONTEND_DIR)/public/
	cp $(DIST_DIR)/ocamlrun.data $(FRONTEND_DIR)/public/
	cp backend/wasm/mopsa_api.js    $(FRONTEND_DIR)/public/
	cp backend/wasm/mopsa_worker.js $(FRONTEND_DIR)/public/

# ── Docker: 32-bit Linux headers ─────────────────────────────────────────────
docker-image: $(BUILD_DIR)/.docker-image-stamp

$(BUILD_DIR)/.docker-image-stamp: docker/Dockerfile.linux32-headers | $(BUILD_DIR)
	DOCKER_BUILDKIT=1 $(DOCKER) build \
		--platform linux/386 \
		-t $(DOCKER_IMAGE) \
		-f docker/Dockerfile.linux32-headers \
		docker/
	touch $@

clean-docker:
	$(DOCKER) rmi -f $(DOCKER_IMAGE) 2>/dev/null || true
	rm -f $(BUILD_DIR)/.docker-image-stamp

# Extract 32-bit Linux system headers from the Docker image.
extract-32-headers: $(BUILD_DIR)/.linux32-headers-stamp

$(BUILD_DIR)/.linux32-headers-stamp: $(BUILD_DIR)/.docker-image-stamp | $(BUILD_DIR)
	mkdir -p $(LINUX32_INCLUDE_DIR)
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE) \
		sh -c 'cd /usr/include && tar -c \
			$$(find . -maxdepth 1 -name "*.h") \
			asm-generic arpa netinet net linux' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE) \
		sh -c 'cd /usr/include/i386-linux-gnu && tar -c \
			$$(find . -maxdepth 1 -name "*.h") \
			bits sys gnu asm' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	# CPython headers (Python.h, pyport.h, ...) come from the 32-bit image too,
	# flattened into the include root.  The find keeps this robust to the Python
	# version shipped by the base image.
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE) \
		sh -c 'cd "$$(dirname $$(find /usr/include -name Python.h | head -1))" && tar -c .' \
		| tar -x -C $(LINUX32_INCLUDE_DIR)
	# Debian ships pyconfig.h as a multiarch wrapper that #includes the real
	# <i386-linux-gnu/python3.11/pyconfig.h> guarded by __i386__.  But Mopsa's C
	# frontend does not target i386 (hence the benign 'regparm' warnings), so
	# that branch is not taken and the real file lives in a subdir we don't
	# flatten.  Resolve the wrapper here by overwriting the flattened pyconfig.h
	# with the real i386 variant, so SIZEOF_LONG/SIZEOF_VOID_P (4) match the
	# glibc 32-bit data model and pyport.h's LONG_BIT == 8*SIZEOF_LONG holds.
	$(DOCKER) run --rm --platform linux/386 $(DOCKER_IMAGE) \
		sh -c 'cat "$$(find /usr/include -path "*i386-linux-gnu/python*/pyconfig.h" | head -1)"' \
		> $(LINUX32_INCLUDE_DIR)/pyconfig.h
	touch $@

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
# lighter (feature-reduced) alternative to the WASM backend
#
# Built with the host opam switch, which needs js_of_ocaml, js_of_ocaml-ppx,
# zarith_stubs_js and vpl-core (installed when missing, see README.md).  js_of_ocaml gives 32-bit ints
# whatever the compiler, so no 32-bit toolchain is needed.
#
# The analyzer is built from a copy of mopsa's kept build directory (without
# its _build), reconfigured with --disable-c: the kept one must stay configured
# for C, ocaml-emcc rebuilds its stubs from there.
JSOO_SWITCH ?= $(SWITCH)
JSOO_OPAM_EXEC := opam exec --switch=$(JSOO_SWITCH) --
JSOO_SWITCH_PREFIX := $(shell opam var --switch=$(JSOO_SWITCH) prefix 2>/dev/null)
JSOO_SWITCH_CONFIG := $(JSOO_SWITCH_PREFIX)/.opam-switch/switch-config
MOPSA_SRC := $(BUILD_DIR)/mopsa-jsoo
MOPSA_INSTALL_TREE := $(MOPSA_SRC)/_build/install/default/lib

VPL_REPO ?= https://github.com/rmonat/VPL.git
JSOO_DEPS := js_of_ocaml js_of_ocaml-ppx zarith_stubs_js
JSOO_DEPS_META := $(foreach p,$(JSOO_DEPS) vpl-core,$(JSOO_SWITCH_PREFIX)/lib/$(p)/META)

jsoo-deps: $(JSOO_DEPS_META)

$(filter-out %/vpl-core/META,$(JSOO_DEPS_META)): $(JSOO_SWITCH_PREFIX)/lib/%/META: | $(JSOO_SWITCH_CONFIG)
	opam install --switch=$(JSOO_SWITCH) -y $*

$(JSOO_SWITCH_PREFIX)/lib/vpl-core/META: | $(JSOO_SWITCH_CONFIG)
	opam pin add --switch=$(JSOO_SWITCH) -y vpl-core "git+$(VPL_REPO)"

# Copied again whenever mopsa is reinstalled (`make mopsa-update`).  mopsa's
# OCaml dependencies are only missing when JSOO_SWITCH is not SWITCH (its
# system ones are those of the C parser, disabled here).
$(MOPSA_SRC)/.configured: $(MOPSA_META) | $(BUILD_DIR) $(JSOO_SWITCH_CONFIG)
	rm -rf $(MOPSA_SRC)
	mkdir -p $(MOPSA_SRC)
	tar -C $(MOPSA_KEPT_SRC) --exclude=./_build -cf - . | tar -C $(MOPSA_SRC) -xf -
	opam install --switch=$(JSOO_SWITCH) -y --deps-only --assume-depexts $(MOPSA_SRC)
	cd $(MOPSA_SRC) && $(JSOO_OPAM_EXEC) ./configure --disable-c
	touch $@

# Build the dune install tree of the copy in-place, then compile the worker
# against it.
jsoo-analyzer: $(MOPSA_SRC)/.configured
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

jsoo-worker: jsoo-analyzer $(JSOO_DEPS_META) | $(BUILD_DIR)
	OCAMLPATH=$(MOPSA_INSTALL_TREE) $(JSOO_OPAM_EXEC) dune build backend/jsoo/mopsa_worker.bc.js
	cp -f _build/default/backend/jsoo/mopsa_worker.bc.js $(BUILD_DIR)/mopsa_worker_jsoo.js

# Assemble the jsoo worker + api + share.json into frontend/public/.
jsoo-web: jsoo-worker $(MOPSA_META)
	cp -f $(BUILD_DIR)/mopsa_worker_jsoo.js $(FRONTEND_DIR)/public/mopsa_worker_jsoo.js
	cp -f backend/jsoo/mopsa_api.js $(FRONTEND_DIR)/public/mopsa_api_jsoo.js
	cd $(FRONTEND_DIR) && ./generateShareJson.sh $(MOPSA_SHARE)/

clean-jsoo:
	rm -f $(BUILD_DIR)/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_api_jsoo.js

# Clean
clean: clean-project clean-jsoo

clean-project:
	dune clean
	rm -rf $(DIST_DIR) $(BUILD_DIR)
