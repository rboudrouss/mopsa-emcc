#!/usr/bin/env bash
# Wrapper around emcc that filters out native x86_64 library paths
# and redirects library resolution to the wasm stubs in build/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"

filtered_args=()
skip_next=false

for arg in "$@"; do
    if $skip_next; then
        skip_next=false
        continue
    fi

    # Strip -L flags pointing to native dirs (keep only build/)
    if [[ "$arg" == -L* ]]; then
        path="${arg#-L}"
        if [[ "$path" == *"/build"* ]]; then
            filtered_args+=("$arg")
        fi
        # Drop all other -L paths (opam, /usr/lib, etc.)
        continue
    fi

    # Strip -Wl,-rpath,... flags
    if [[ "$arg" == -Wl,-rpath,* ]]; then
        continue
    fi

    # Strip native CRT objects and linker plugins
    if [[ "$arg" == */crt*.o ]] || [[ "$arg" == */liblto_plugin* ]] || [[ "$arg" == */ld-linux* ]]; then
        continue
    fi

    # Strip libs that don't exist in wasm / handled by emcc
    if [[ "$arg" == "-lgcc" ]] || [[ "$arg" == "-lgcc_s" ]]; then
        continue
    fi

    # Strip OCaml-specific flag not understood by emcc
    if [[ "$arg" == "-Z-reserved-lib-stdc++" ]]; then
        continue
    fi

    filtered_args+=("$arg")
done

# Prepend our build dir so wasm stubs are found first
exec emcc "-L$BUILD_DIR" "${filtered_args[@]}"
