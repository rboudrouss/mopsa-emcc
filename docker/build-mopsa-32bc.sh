#!/bin/bash
# Build 32-bit mopsa_worker.bc inside a 32-bit Docker container.
#
# Expected environment (provided by the Docker image / Makefile):
#   - linux/386 container with OCaml 5.4.1 at /opt/ocaml-32b (built from
#     source, bytecode-only, with --host=i686-linux-gnu; OCaml 5 has no i386
#     native backend, and only bytecode is needed for mopsa-32.bc)
#   - /workspace  : project root mounted from the host
#   - /root/.opam : mounted as a named Docker volume (persists between runs)
#
# On the first run this script sets up the full opam environment (~5 min).
# Subsequent runs reuse the cached volume and are much faster.
#
# Output: /workspace/build/mopsa-32.bc

set -e

SWITCH="5.4.1"

cd /workspace

# ── 1. Bootstrap opam (first run only) ───────────────────────────────────────
if [ ! -f /root/.opam/config ]; then
    echo "=== Initialising opam (first run — cached in Docker volume) ==="
    opam init --disable-sandboxing --bare -y
fi

# ── 2. Create switch using the system OCaml (first run only) ─────────────────
# ocaml-system uses whatever `ocaml` is in PATH, which is our custom-built
# /opt/ocaml-32b binary.  That binary was compiled with --host=i686-linux-gnu
# so it is a proper i386 native compiler (ocamlopt included).
if ! opam switch list --short 2>/dev/null | grep -qx "${SWITCH}"; then
    echo "=== Creating OCaml ${SWITCH} switch (system) ==="
    opam switch create "${SWITCH}" ocaml-system."${SWITCH}"
fi

eval "$(opam env --switch=${SWITCH})"

# ── 3. Pin camlidl to the local submodule (first run only) ───────────────────
# The opam-repository camlidl may conflict with some switch configurations.
# Our local deps/camlidl/camlidl.opam has no such constraints and its
# compiler/Makefile links the camlidl binary with ocamlc, so it builds fine.
if ! opam list --short --installed --switch="${SWITCH}" 2>/dev/null | grep -qx "camlidl"; then
    opam pin add camlidl /workspace/deps/camlidl --no-action -y
fi

# ── 4. Install mopsa transitive dependencies (cached after first run) ─────────
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
    camlidl

# ── 5. Build and install mopsa-analyzer ──────────────────────────────────────
# We bypass `opam install mopsa` entirely: the mopsa Makefile calls
# `opam exec -- dune build` which fails inside a nested `opam install` context
# (opam lock contention).  Building directly with dune works fine.
rm -rf /tmp/mopsa-src
cp -r deps/mopsa-analyzer /tmp/mopsa-src
rm -f /tmp/mopsa-src/.git

cd /tmp/mopsa-src
./configure

# On i386 (x87 FPU), FLT_EVAL_METHOD is 2 (extended precision), not 0.
# floats_round.c requires FLT_EVAL_METHOD == 0.
# Adding -mfpmath=sse -msse2 forces SSE2 floating-point which gives
# FLT_EVAL_METHOD == 0, matching the behaviour mopsa expects.
sed -i 's/(flags -fPIC -frounding-math)/(flags -fPIC -frounding-math -mfpmath=sse -msse2)/' \
    utils/dune

opam exec -- dune build --build-dir=/tmp/mopsa-build --profile release

OPAM_PREFIX="$(opam var prefix --switch=${SWITCH})"
opam exec -- dune install \
    --build-dir=/tmp/mopsa-build \
    --prefix="${OPAM_PREFIX}" \
    --profile release

cd /workspace

# ── 6. Build mopsa_worker.bc ─────────────────────────────────────────────────
# --build-dir keeps artefacts in /tmp so they don't overwrite the host's
# _build/ directory (which contains the 64-bit build output).
opam exec -- dune build \
    --build-dir=/tmp/mopsa-32-build \
    backend/wasm/mopsa_worker.bc \
    --profile release

cp /tmp/mopsa-32-build/default/backend/wasm/mopsa_worker.bc \
    build/mopsa-32.bc

echo "Successfully built 32-bit bytecode: build/mopsa-32.bc"
