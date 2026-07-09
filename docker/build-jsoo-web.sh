#!/bin/bash
# Build the js_of_ocaml backend worker inside the 32-bit Docker container.
#
# Mirrors docker/build-mopsa-32bc.sh: same image (mopsa-emcc-32bc), same
# opam volume (mopsa-emcc-opam-32), so the switch and the mopsa deps are
# shared with the wasm bytecode build and only installed once. js_of_ocaml
# itself is pure OCaml, so building it in the 32-bit container is fine (the
# generated JS uses 32-bit ints regardless of the host).
#
# The analyzer is configured with --disable-c in a /tmp copy (the Clang
# parser can't be used from JS anyway), then the worker is compiled against
# its dune install tree via OCAMLPATH — nothing is installed in the switch
# and the host checkout is left untouched.
#
# Output: /workspace/build/mopsa_worker_jsoo.js

set -e

SWITCH="4.14.2"

cd /workspace

# ── 1. Bootstrap opam (first run only) ───────────────────────────────────────
if [ ! -f /root/.opam/config ]; then
    echo "=== Initialising opam (first run — cached in Docker volume) ==="
    opam init --disable-sandboxing --bare -y
fi

# ── 2. Create switch using the system OCaml (first run only) ─────────────────
if ! opam switch list --short 2>/dev/null | grep -qx "${SWITCH}"; then
    echo "=== Creating OCaml ${SWITCH} switch (system) ==="
    opam switch create "${SWITCH}" ocaml-system."${SWITCH}"
fi

eval "$(opam env --switch=${SWITCH})"

# ── 3. Pin camlidl to the local submodule (first run only) ───────────────────
if ! opam list --short --installed --switch="${SWITCH}" 2>/dev/null | grep -qx "camlidl"; then
    opam pin add camlidl /workspace/deps/camlidl --no-action -y
fi

# ── 4. Install mopsa + jsoo dependencies (cached after first run) ────────────
opam install -y --switch="${SWITCH}" \
    dune \
    ocamlfind \
    menhir \
    zarith \
    mlgmpidl \
    apron \
    yojson \
    "arg-complete>=0.2.1" \
    "qcheck-core>=0.26" \
    camlidl \
    "js_of_ocaml>=6.0" \
    js_of_ocaml-ppx \
    zarith_stubs_js

# VPL (pure-OCaml polyhedra library, rmonat's fork) gives the jsoo build a
# relational domain that doesn't depend on Apron's C stubs (-numeric vpl).
if ! opam list --short --installed --switch="${SWITCH}" 2>/dev/null | grep -qx "vpl-core"; then
    opam pin add vpl-core https://github.com/rmonat/VPL.git -y --switch="${SWITCH}"
fi

# ── 5. Build the analyzer without C in a /tmp copy ───────────────────────────
# Outside /workspace so dune doesn't pick up the repo's dune-workspace, and
# so the host's analyzer/dune (possibly configured differently) is untouched.
rsync -a --delete --exclude=_build --exclude=.git \
    deps/mopsa-analyzer/ /tmp/mopsa-jsoo-src/

cd /tmp/mopsa-jsoo-src
./configure --disable-c

# `--only-packages mopsa` populates the full install tree (cmi/cma/META/
# dune-package) for every mopsa sub-library.  It errors out on the Clang
# C stub parser (headers rejected) but only after every jsoo-relevant
# artefact is produced; we ignore the non-zero exit and re-run the
# dune-package target so it doesn't reference the C parser.
opam exec -- dune build --profile release --only-packages mopsa || true
opam exec -- dune build --profile release \
    _build/install/default/lib/mopsa/dune-package

cd /workspace

# ── 6. Build the jsoo worker ─────────────────────────────────────────────────
# --build-dir keeps artefacts in /tmp so they don't overwrite the host's
# _build/ directory.
OCAMLPATH=/tmp/mopsa-jsoo-src/_build/install/default/lib \
    opam exec -- dune build \
    --build-dir=/tmp/jsoo-build \
    backend/jsoo/mopsa_worker.bc.js

cp /tmp/jsoo-build/default/backend/jsoo/mopsa_worker.bc.js \
    build/mopsa_worker_jsoo.js

echo "Successfully built jsoo worker: build/mopsa_worker_jsoo.js"
