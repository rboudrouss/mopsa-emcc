# Dependencies:
# - OCaml 4.14.2 opam switch ($(SWITCH)), where mopsa is pinned to the 32-bit fork
#   (`make mopsa-install`; the C parser needs a host clang + llvm-dev)
# - ocaml-emcc (https://github.com/rboudrouss/ocaml-emcc), with cmake for its clang recipe
# - Emscripten SDK (emcc in PATH)
# - Docker (32-bit Linux headers, jsoo worker)
#   - Build the image with: `docker build -t mopsa-emcc-32bc -f docker/Dockerfile.mopsa-32bc docker/`

.ONESHELL:

# Variables
DIST_DIR := $(CURDIR)/dist
BUILD_DIR := $(CURDIR)/build
FRONTEND_DIR := $(CURDIR)/frontend
LINUX32_INCLUDE_DIR := $(BUILD_DIR)/linux32-include

NPM := pnpm
DOCKER := docker
DOCKER_IMAGE_32BC := mopsa-emcc-32bc

# opam switch holding mopsa and its dependencies.  ocaml-emcc builds its wasm
# runtime and C libraries in $(SWITCH_PREFIX)/emcc-sysroot.
SWITCH ?= 4.14.2
OPAM_EXEC := opam exec --switch=$(SWITCH) --
SWITCH_PREFIX := $(shell opam var --switch=$(SWITCH) prefix 2>/dev/null)
OCAML_EMCC ?= ocaml-emcc
# Extra options of `ocaml-emcc build` (e.g. `-O -Oz`, `--stack-size 16MB`)
OCAML_EMCC_FLAGS ?=

# Mopsa is pinned to the 32-bit fork until its 31-bit fixes are merged upstream.
MOPSA_REPO ?= https://gitlab.com/rboudrouss/mopsa-analyzer-32-bit.git
MOPSA_BRANCH ?= main
# A clone of the same branch, for the jsoo worker (configured with --disable-c)
# and the frontend's share.json
MOPSA_SRC := $(BUILD_DIR)/mopsa-analyzer

# Phony targets
.PHONY: all wasm wasm-node wasm-web wasm-web-artifacts final-web frontend-build \
        mopsa-install mopsa-update docker-image-32bc extract-32-headers \
        jsoo-analyzer jsoo-web jsoo-web-native jsoo-web-docker \
        clean clean-project clean-docker-32bc clean-jsoo

# Targets
all: final-web

$(DIST_DIR) $(BUILD_DIR):
	mkdir -p $@

# ── Mopsa ────────────────────────────────────────────────────────────────────
# Installed in the switch with opam, natively: ocaml-emcc rebuilds its C stubs
# (the C parser against its own clang 9) from the build directory opam keeps.
MOPSA_META := $(SWITCH_PREFIX)/lib/mopsa/META

mopsa-install: $(MOPSA_META)

$(MOPSA_META):
	opam pin add --switch=$(SWITCH) -y --no-action mopsa "git+$(MOPSA_REPO)#$(MOPSA_BRANCH)"
	OPAMKEEPBUILDDIR=true opam install --switch=$(SWITCH) -y mopsa

$(MOPSA_SRC)/.git: | $(BUILD_DIR)
	git clone --depth 1 --branch $(MOPSA_BRANCH) $(MOPSA_REPO) $(MOPSA_SRC)

# Rebuild mopsa (and update the clone) from the latest commit of $(MOPSA_BRANCH)
mopsa-update:
	opam update --switch=$(SWITCH) mopsa
	OPAMKEEPBUILDDIR=true opam upgrade --switch=$(SWITCH) -y mopsa
	if [ -d $(MOPSA_SRC)/.git ]; then git -C $(MOPSA_SRC) pull --ff-only; fi

# ── WASM backend (ocaml-emcc) ────────────────────────────────────────────────
# ocaml-emcc builds the wasm ocamlrun, the C libraries (gmp, mpfr, apron, clang 9:
# ocaml-emcc.conf and emcc-recipes/) and the C stubs of every library linked in
# backend/wasm/mopsa_worker.bc, then links them with the bytecode.
OCAML_EMCC_BUILD = $(OPAM_EXEC) $(OCAML_EMCC) build $(1) --exe backend/wasm/mopsa_worker $(OCAML_EMCC_FLAGS)

# Clang's resource headers, found by the C parser at the resource directory of
# the host clang that mopsa was configured with (baked into its dune file).
CLANG_RESOURCE_DIR = $$(sed -n 's|.*(echo "\(/[^"]*\)").*|\1|p' $(SWITCH_PREFIX)/.opam-switch/build/mopsa.*/parsers/c/lib/parser/dune)
CLANG_HEADERS = $$($(OPAM_EXEC) $(OCAML_EMCC) env --sysroot)/lib/clang/9.0.1/include
MOPSA_SHARE := $(SWITCH_PREFIX)/share/mopsa

# Same flags as the frontend expects: FS/ENV for the worker, pre.js/post.js
WASM_EMCC_FLAGS := -sEXPORTED_RUNTIME_METHODS=FS,ENV \
	--pre-js backend/wasm/pre.js --post-js backend/wasm/post.js

# Standalone browser build (HTML harness)
wasm: $(MOPSA_META) | $(DIST_DIR)
	$(call OCAML_EMCC_BUILD,$(DIST_DIR)/ocamlrun.html) --preload -- \
		-sENVIRONMENT=web $(WASM_EMCC_FLAGS) \
		--preload-file $(MOPSA_SHARE)@/share/mopsa \
		--preload-file $(CLANG_HEADERS)@$(CLANG_RESOURCE_DIR)/include

# Node.js build on the real file system, run like the native mopsa:
#   node dist/node/mopsa.js -share-dir=$(MOPSA_SHARE) -target-triple=x86_64-pc-linux-gnu \
#     -I <sysroot>/lib/clang/9.0.1/include -I /usr/include/x86_64-linux-gnu -I /usr/include ...
# (the C parser's resource directory is the host clang's, whose headers are newer)
wasm-node: $(MOPSA_META)
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
wasm-web-artifacts: $(MOPSA_META) $(BUILD_DIR)/.linux32-headers-stamp | $(DIST_DIR)
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

# ── Docker: 32-bit Linux headers (and the jsoo worker below) ─────────────────
docker-image-32bc: $(BUILD_DIR)/.docker-32bc-stamp

$(BUILD_DIR)/.docker-32bc-stamp: docker/Dockerfile.mopsa-32bc | $(BUILD_DIR)
	DOCKER_BUILDKIT=1 $(DOCKER) build \
		--platform linux/386 \
		-t $(DOCKER_IMAGE_32BC) \
		-f docker/Dockerfile.mopsa-32bc \
		docker/
	touch $@

clean-docker-32bc:
	$(DOCKER) rmi -f $(DOCKER_IMAGE_32BC) 2>/dev/null || true
	$(DOCKER) volume rm mopsa-emcc-opam-32 2>/dev/null || true
	rm -f $(BUILD_DIR)/.docker-32bc-stamp

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
# Note: jsoo-analyzer reconfigures the clone $(MOPSA_SRC) with --disable-c.

# Source of the jsoo worker:
#   docker (default) : built inside the 32-bit container (mopsa-emcc-32bc),
#                      with its own switch in the mopsa-emcc-opam-32 volume.
#                      Requires only Docker on the host.
#   native           : built with the host opam switch below.  Fast on
#                      subsequent runs, but needs the switch configured (see
#                      "Native build" in README.md).  Use with
#                      `make JSOO_SRC=native ...`.
JSOO_SRC ?= docker
JSOO_SWITCH ?= $(SWITCH)
JSOO_OPAM_EXEC := opam exec --switch=$(JSOO_SWITCH) --
MOPSA_INSTALL_TREE := $(MOPSA_SRC)/_build/install/default/lib

# Native path: reconfigure the clone with --disable-c and build its dune
# install tree in-place, then compile the worker against it.
jsoo-analyzer: $(MOPSA_SRC)/.git
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

# Docker path: mopsa-emcc-32bc image + mopsa-emcc-opam-32 volume.  Analyzer
# configure/build happens in /tmp inside the container (host clone left
# untouched).
jsoo-web-docker: $(BUILD_DIR)/.docker-32bc-stamp $(MOPSA_SRC)/.git | $(BUILD_DIR)
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
	cd $(FRONTEND_DIR) && ./generateShareJson.sh $(MOPSA_SRC)/share/mopsa/

clean-jsoo:
	rm -f $(BUILD_DIR)/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_worker_jsoo.js \
	      $(FRONTEND_DIR)/public/mopsa_api_jsoo.js

# Clean
clean: clean-project clean-jsoo

clean-project:
	dune clean
	rm -rf $(DIST_DIR) $(BUILD_DIR)
