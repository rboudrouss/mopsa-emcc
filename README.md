# Mopsa-WASM

A WebAssembly build of [Mopsa](https://gitlab.com/mopsa/mopsa-analyzer), a modular open-source static analyzer for C and Python, runnable directly in the browser or in Node.js.

This repository orchestrates the cross-compilation of OCaml, Clang/LLVM, GMP, MPFR, Apron and the Mopsa analyzer itself to `wasm32-unknown-emscripten`, producing a self-contained `ocamlrun.wasm` shipped with a React frontend.

The frontend actually ships two backends: the full WASM build, and a lighter pure-JavaScript build of the analyzer compiled with `js_of_ocaml` (see [The js_of_ocaml backend](#the-js_of_ocaml-backend)).

## Project layout

| Path             | Contents                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `backend/wasm/`  | OCaml entry point (`mopsa_worker.ml`), primitive table, FPU stub, JS API and Web Worker glue      |
| `backend/jsoo/`  | js_of_ocaml backend: worker entry point, runtime primitive stubs, JS API glue                     |
| `frontend/`      | React app consuming the WASM module                                                               |
| `deps/`          | Submodules and vendored source trees for every native dependency                                  |
| `libs/`          | Install prefix for built libraries (`make install` lands here)                                    |
| `build/`         | Temporary build artefacts (`_build/` is reserved for dune output)                                 |
| `dist/`          | Final `.wasm`, `.js`, `.html` and `.data` outputs                                                 |
| `docker/`        | Image and scripts for the 32-bit Mopsa bytecode build                                             |

The `deps/` submodules are:

- `ocaml-wasm`: OCaml 4.14.2 runtime patched for `wasm32` (fork)
- `mopsa-analyzer`: the analyzer, patched for Clang 9 & WASM support (fork)
- `llvm-project`: LLVM/Clang 9.x
- `apron`, `mlgmpidl`, `Zarith`, `camlidl`: numeric / FFI libraries
- `primitives`: standard ocaml libs

Plus the vendored `gmp-6.1.2/` and `mpfr-4.2.2/` source trees.

## Prerequisites

- **OCaml 4.14.2** with `camlidl` installed. (Necessary to generate APRON's ocaml primitives)
   - For the **native** jsoo build, the same switch also needs `js_of_ocaml` (≥ 6.0), `js_of_ocaml-ppx`, `zarith_stubs_js` on top of the Mopsa deps
   - The **Docker** jsoo build reuses the `mopsa-emcc-32bc` image + `mopsa-emcc-opam-32` volume of the wasm bytecode step, so no extra host setup
- **Emscripten SDK**: update `EMSDK_TOOLCHAIN` and `EMSDK_SYSROOT` in the Makefile to match your install path
- **Docker**: required for the default 32-bit bytecode build and to extract the 32-bit Linux / CPython headers (see *Native build* to skip it for the bytecode step)
- **gcc-11 / g++-11**: needed to compile the older LLVM 9 source tree
- **Node.js & npm**: for the React frontend
   - **pnpm** is the default in the makefile, you can change it.
- Standard build tools: `make`, `cmake`, `ninja`, `perl`, `m4`

After cloning:

```sh
git submodule update --init --recursive
```

Build the docker image :
```sh
docker build -t mopsa-emcc-32bc -f docker/Dockerfile.mopsa-32bc docker/
```

## Building

The most common workflow:

```sh
make final-web
```

This builds **both backends** (WASM + jsoo) and the React frontend. Note that the LLVM/CLANG step can take ~30 min depending on your machine!

To build the frontend with a single backend:

```sh
make wasm-web   # WASM backend only + frontend
make jsoo-web   # jsoo backend artifacts only (no frontend build)
```

Step targets are also available if you only want to (re)run a single stage.

### Native build

You can build the Mopsa bytecode (wasm side) and the jsoo worker without Docker, using a host opam switch instead of the 32-bit container. This requires a Mopsa-compatible host:
- Clang <= 19
- Install `mopsa` dependencies: `opam install deps/mopsa-analyzer --deps-only`
- Pin `mopsa` at `deps/mopsa-analyzer`: `opam pin add --switch 4.14.2 mopsa deps/mopsa-analyzer`
- Extra packages for the jsoo backend: `opam install js_of_ocaml js_of_ocaml-ppx zarith_stubs_js`

```sh
make MOPSA_BC_SRC=native JSOO_SRC=native final-web
```

Both variables are independent: use `MOPSA_BC_SRC=native` alone to skip Docker on the wasm bytecode step, or `JSOO_SRC=native` alone to skip it on the jsoo worker step.

> **Note:** these switches only remove Docker from their respective analyzer builds. `wasm` and `wasm-node` can then be built with no Docker at all, but the web builds still need the Docker image once, to extract the 32-bit Linux / CPython headers (`make extract-32-headers`).

### Other entry points

- `make wasm`: standalone browser build `dist/ocamlrun.html`
- `make wasm-node`: Node.js build `node dist/ocamlrun.js mopsa.bc …`
- `make wasm-web-artifacts`: MODULARIZE'd WASM build copied into `frontend/public/` (no frontend build)
- `make jsoo-web`: jsoo backend copied into `frontend/public/` (+ regenerates `share.json`). Picks the worker source from `JSOO_SRC` (`docker`, default; or `native`).
- `make jsoo-web-docker`: build only the jsoo worker via the `mopsa-emcc-32bc` container → `build/mopsa_worker_jsoo.js`
- `make jsoo-web-native`: build only the jsoo worker with the host switch → `build/mopsa_worker_jsoo.js`
- `make frontend-build`: `pnpm install` + `vite build` only

## Cleaning

```sh
make clean              # everything except the Docker volume
make clean-docker-32bc  # remove the 32-bit Docker image and the opam cache volume
```

Per-component clean targets are also available: `clean-ocaml`, `clean-mopsa`,
`clean-gmp`, `clean-mpfr`, `clean-apron`, `clean-llvm`, `clean-jsoo`.

## Licence

This project is licensed under the [MIT License](LICENSE). The license covers only the code I authored: files at the root of the project, and those in `docker/`, `backend/` and `frontend/` (with the exception of `frontend/public/sync-message.js`).

All other code is owned by its respective authors and is not covered by this license. Please refer to the corresponding upstream projects (Mopsa, OCaml, LLVM/Clang, GMP, MPFR, Apron, etc.) for their own licensing terms.

## How it works

`ocamlrun`, OCaml's bytecode interpreter, is cross-compiled to WebAssembly through emscripten. Every C library is linked statically into a single `ocamlrun.wasm` (the final wasm is "only" 15mb). The Mopsa bytecode (`mopsa.bc`) is preloaded into emscripten's virtual filesystem, together with Clang's resource headers, the Linux 32-bit headers, and the Mopsa stubs directory.

The 4.14.2 runtime fork [`ocaml-wasm`](https://github.com/rboudfork/ocaml) is heavily inspired by [Vincent Chan's fork](https://github.com/vincentdchan/ocaml), to which it adds patches for codegen issues affecting `Hd_val` / `Tag_val` (forced 32-bit loads, non-l-value `Tag_val` plus a new `Tag_set` macro).

## The js_of_ocaml backend

`backend/jsoo/` compiles the whole analyzer to plain JavaScript with [js_of_ocaml](https://ocsigen.org/js_of_ocaml/) (same approach as the official [try-mopsa](https://gitlab.com/rmonat/mopsa-web) page), exposing the same `mopsaJs` API and worker protocol as the WASM backend. It is used automatically when the browser cannot run WebAssembly, or on demand via Options > Browser Compat.

It is feature-reduced compared to WASM:

- **No C / cross-language analysis** since the Clang parser is a C++ library. The analyzer is configured with `--disable-c`. Only Universal and Python.
- **No Apron relational domains** since Apron is a C library.
- All three engines work (`automatic`, `interactive`, `dap`) and sessions use the same SharedArrayBuffer stdin channel as WASM.

Just like the wasm bytecode, the jsoo worker can be built two ways:

- **Docker** (default, `JSOO_SRC=docker`): compiled inside the `mopsa-emcc-32bc` container, sharing the same opam volume as the wasm bytecode build. Zero host setup beyond Docker.
- **Native** (`JSOO_SRC=native`): compiled with the host opam switch. Faster on rebuilds but needs the switch prepped (see [Native build](#native-build)).

The frontend’s `share.json` is regenerated by `make jsoo-web` and served to the worker at runtime, so the two backends share exactly the same stubs / config presets.

## Acknowledgements

The OCaml-to-WASM port was first built on [Vincent Chan](https://github.com/okcdz)'s work on `ocaml-wasm` (August 2021), which provided the original `configure` tweaks and the libs (`unix_lib.c`, `socketaddr.c`, `unixsupport.c`, ...) needed to run OCaml's runtime under emscripten.

[Binji's fork](https://github.com/binji/llvm-project) and [Binji's Notes](https://gist.github.com/binji/b7541f9740c21d7c6dac95cbc9ea6fca) helped a lot to figure out how to build LLVM/Clang.

The specific versions of mpfr & gmp that were easy to compile using emscripten were pointed by [this response](https://stackoverflow.com/a/43583154) in stackoverflow by Claude

## Project history

This project originally started as a university project for the PSTL course in [Sorbonne University's Master's program in Software Science and Technology](https://sciences.sorbonne-universite.fr/en/formation-sciences/masters/master-informatique/parcours-stl). The initial exploration using `js_of_ocaml` can be found in the [MOPSA analyzer js](https://gitlab.com/rboudrouss/mopsa-analyzer-js) repo, and the first WebAssembly-related experiments are available in its `wasm` branch.

Later, I continued working on the project in my spare time, and it eventually evolved into [mopsa-wasm](https://github.com/rboudrouss/mopsa-wasm), where you can find the various experiments, successes, and failures I encountered while exploring Emscripten and WASI.

The project has since found its way into this repository, where these efforts finally came together successfully.
