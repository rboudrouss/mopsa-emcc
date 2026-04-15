#!/bin/bash
# Build 32-bit mopsa_worker.bc inside a 32-bit Docker container.
#
# Expected environment (provided by the Docker image / Makefile):
#   - linux/386 container (Debian bookworm-slim + system libs + opam binary)
#   - /workspace  : project root mounted from the host
#   - /root/.opam : mounted as a named Docker volume (persists between runs)
#
# On the first run this script sets up the full opam environment (~10 min).
# Subsequent runs reuse the cached volume and are much faster.
#
# Output: /workspace/build/mopsa-32.bc

set -e

SWITCH="4.12.0"

cd /workspace

# ── 1. Bootstrap opam (first run only) ───────────────────────────────────────
if [ ! -f /root/.opam/config ]; then
    echo "=== Initialising opam (first run — this is cached in the Docker volume) ==="
    opam init --disable-sandboxing --bare -y
fi

# ── 2. Create bytecode-only OCaml switch (first run only) ────────────────────
# ocaml-option-bytecode-only disables the native compiler, which avoids a
# hard compilation error in OCaml 4.12.0's signals_nat.c on i386: the file
# references REG_RIP (x86-64) rather than REG_EIP (i386) because Docker's
# 32-bit container runs on a 64-bit kernel and uname -m returns x86_64.
if ! opam switch list --short 2>/dev/null | grep -qx "${SWITCH}"; then
    echo "=== Creating OCaml ${SWITCH} bytecode-only switch ==="
    opam switch create "${SWITCH}" \
        --packages="ocaml-variants.${SWITCH}+options,ocaml-option-bytecode-only"
fi

eval "$(opam env --switch=${SWITCH})"

# ── 3. Pin camlidl to the local submodule (first run only) ───────────────────
# The opam-repository version of camlidl declares a conflict with
# ocaml-option-bytecode-only (it expects ocamlopt to be present).
# Our local deps/camlidl/camlidl.opam has no such constraint, and the
# compiler/Makefile links the camlidl binary with ocamlc — so bytecode-only
# works fine in practice.
if ! opam show camlidl 2>/dev/null | grep -q "pinned"; then
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

# ── 5. Patch and pin mopsa-analyzer ──────────────────────────────────────────
# Copy to a writable location, then remove the `!(arch = "x86_32")` availability
# constraint — the upstream mopsa.opam bars installation on i386, but we only
# need the bytecode output so the constraint is not applicable here.
rm -rf /tmp/mopsa-src
cp -r deps/mopsa-analyzer /tmp/mopsa-src
sed -i 's/!(arch = "x86_32") & //' /tmp/mopsa-src/mopsa.opam

opam pin add mopsa /tmp/mopsa-src --no-action -y
opam install mopsa -y --switch="${SWITCH}"

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
