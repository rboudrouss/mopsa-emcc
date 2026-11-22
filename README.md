# Mopsa-WASM

A WebAssembly build of [Mopsa](https://gitlab.com/mopsa/mopsa-analyzer), a modular open-source static analyzer for C and Python, runnable directly in the browser or in Node.js.

This repository builds the analyzer with [ocaml-emcc](https://github.com/rboudrouss/ocaml-emcc), which compiles OCaml's runtime, Clang/LLVM, GMP, MPFR, Apron and Mopsa (its bytecode compiled to C) to `wasm32-unknown-emscripten`, producing a self-contained `ocamlrun.wasm` shipped with a React frontend.

Mopsa's bytecode is compiled to C by [c_of_ocaml](https://github.com/rboudrouss/C_of_ocaml), ocaml-emcc's default mode, with `cps-stack: yes` in `ocaml-emcc.conf`: the compiled code recurses on the browser's own stack (about 500 KB in a worker), which OCaml 4.14's `List.map` overflows as soon as a C file includes `<stdlib.h>`, so deep recursions go on in continuation-passing style on the heap, in every browser.

The frontend actually ships two backends: the full WASM build, and a lighter pure-JavaScript build of the analyzer compiled with `js_of_ocaml` (see [The js_of_ocaml backend](#the-js_of_ocaml-backend)).

## Project layout

| Path             | Contents                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `backend/wasm/`  | OCaml entry point (`mopsa_worker.ml`), JS API and Web Worker glue                                 |
| `backend/jsoo/`  | js_of_ocaml backend: worker entry point, runtime primitive stubs, JS API glue                     |
| `frontend/`      | React app consuming the WASM module                                                               |
| `ocaml-emcc.conf`, `emcc-recipes/` | ocaml-emcc configuration: wasm32 target, clang 9, apron and mopsa recipes, the patches of Mopsa |
| `build/`         | Temporary build artefacts: copy of Mopsa's sources for the jsoo backend, 32-bit headers (`_build/` is reserved for dune output) |
| `dist/`          | Final `.wasm`, `.js`, `.html` and `.data` outputs                                                 |
| `docker/`        | i386 Debian image, source of the Linux / CPython headers of the WASM web build                    |

Mopsa itself is not vendored. It is installed in the opam switch from the latest commit of [upstream](https://gitlab.com/mopsa/mopsa-analyzer)'s `main` branch (`MOPSA_REPO` / `MOPSA_BRANCH` in the Makefile), and changed by the patches of `emcc-recipes/mopsa/patches/`. They fix 31-bit integers and floating-point rounding on wasm32, and add the debug adapter requests and JSON progress the frontend reads. ocaml-emcc applies them to the wasm build (`PATCH_OCAML=1` in the recipe), `make jsoo-web` to its copy of the sources, and the native build in the switch stays upstream's. A patch is a unified diff whose hunks are placed by their text, so it keeps applying while upstream moves around it. The About panel shows the upstream commit and the patches of the build (`frontend/mopsa-build.json`, written by the Makefile).

## Sharing

The Share button gives a link, or the HTML of an iframe that embeds the page in another site (`?embed`: the editor and the results, a file switcher, a button that opens the files in Mopsa). The link carries the current file, its workspace or all files after its `#`, never uploaded, and by default the configuration and the options that differ from their defaults. A file whose path the visitor already uses with another text is renamed (`a_1.c`, or a folder `w_2/`). Links of the first version (`#share=` of one workspace) still open.

A link with `?open=owner/repo@tag:folder` opens the C, Python and Universal sources of a GitHub repository, or of one of its folders, fetched through jsDelivr, in a workspace named after it (`NAME_2/` when the visitor's folder of that name holds other files). `open` also takes a GitHub URL or an archive's URL (zip, tar, tar.gz, served with CORS), can be repeated, and `?file=NAME` names the file opened. The Share dialog lists the folders opened so and can put them, or others, in a link instead of their files, a GitHub repository pinned to its latest commit by default.

With `?temp`, as in an embed, the files, config and options stay in memory and the visitor's own are left alone, for a course or a demo. The top bar says so, and its badge has a button that keeps the files. The dialog checks it by default when the link opens folders. Its (i) buttons explain each part, including what an embed needs. `frontend/tests/share.mjs` tests all of this in headless Chromium against `pnpm dev`.

## Prerequisites

The opam switch and the opam packages below are created / installed by the Makefile when missing (`make deps` installs them all at once); the other prerequisites are system ones.

- **An OCaml 4.14.2 opam switch**, named `4.14.2` by default (`make SWITCH=<name> ...` for another one). When it does not exist, the Makefile creates it with `ocaml-base-compiler.$(OCAML_VERSION)` (4.14.2), without selecting it.
   - `make mopsa-install` (run by the WASM targets the first time) pins and installs `mopsa` there, natively, with `OPAMKEEPBUILDDIR=true`: ocaml-emcc rebuilds its C stubs from the build directory opam keeps. Its C parser needs a **host clang and LLVM** (`clang libclang-dev libclang-cpp-dev llvm-dev` on Debian/Ubuntu), of any version Mopsa supports.
   - For the jsoo backend, the same switch also needs `js_of_ocaml` (≥ 6.0), `js_of_ocaml-ppx`, `zarith_stubs_js` and VPL, a pure-OCaml relational domain, pinned to `https://github.com/rmonat/VPL.git` (`make jsoo-deps`)
- **[ocaml-emcc](https://github.com/rboudrouss/ocaml-emcc)**: pinned in the switch (`make ocaml-emcc-install`) unless one is in `PATH` or given with `make OCAML_EMCC=/path/to/ocaml-emcc ...`. Its clang recipe needs `cmake` (+ `ninja` preferably)
- **[c_of_ocaml](https://github.com/rboudrouss/C_of_ocaml)**, which ocaml-emcc runs to compile the bytecode to C: `make ocaml-emcc-install` builds it with dune from a clone in `build/` and copies it to the switch's `bin` (it has no opam package), unless one is in `PATH` or given with `OCAML_EMCC_C_OF_OCAML=/path/to/c_of_ocaml.exe`
- **Emscripten SDK**, with `emcc` in `PATH` (`source emsdk_env.sh`)
- **Docker**: to extract the 32-bit Linux / CPython headers preloaded in the web build (a small i386 Debian image, built by `make docker-image`)
- **Node.js & npm**: for the React frontend
   - **pnpm** is the default in the makefile, you can change it.

## Building

The most common workflow:

```sh
make final-web
```

This builds **both backends** (WASM + jsoo) and the React frontend. The first WASM build also builds ocaml-emcc's wasm runtime and C libraries in the switch (`$OPAM_SWITCH_PREFIX/emcc-sysroot`): its clang 9 recipe takes about 15 min on 4 cores.

`make mopsa-update` rebuilds `mopsa` from the latest commit of the pinned branch (and moves a switch still pinned to the former 32-bit fork to upstream), `make ocaml-emcc-update` ocaml-emcc and c_of_ocaml from theirs. The wasm builds have ocaml-emcc rebuild mopsa in the sysroot when its commit changes.

To build the frontend with a single backend:

```sh
make wasm-web   # WASM backend only + frontend
make jsoo-web   # jsoo backend artifacts only (no frontend build)
```

Step targets are also available if you only want to (re)run a single stage.

> **Note:** `wasm`, `wasm-node` and `jsoo-web` need no Docker at all, but the WASM web build needs the Docker image once, to extract the 32-bit Linux / CPython headers (`make extract-32-headers`).

### Other entry points

- `make wasm`: standalone browser build `dist/ocamlrun.html`
- `make wasm-node`: Node.js build `dist/node/mopsa.js` on the real file system, run like the native `mopsa` (see the Makefile for the clang headers to pass)
- `make wasm-web-artifacts`: MODULARIZE'd WASM build copied into `frontend/public/` (no frontend build)
- `make jsoo-web`: jsoo backend copied into `frontend/public/` (+ regenerates `share.json`)
- `make jsoo-worker`: build only the jsoo worker → `build/mopsa_worker_jsoo.js`
- `make frontend-build`: `pnpm install` + `vite build` only

### Hosting

`frontend/dist` is a static site, which needs two response headers, `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (the interactive and DAP engines use `SharedArrayBuffer`), as `frontend/public/_headers` sets them on Cloudflare Pages. It also sends `Cross-Origin-Resource-Policy: cross-origin`, without which a cross-origin isolated page cannot embed the site.

Cloudflare Pages serves no file over 25 MiB, and `ocamlrun.wasm` is bigger: it is served, with `ocamlrun.data`, from an R2 bucket.

1. Create the bucket, and connect it to a custom domain (the `r2.dev` URL is rate-limited, for development only).
2. Give it a CORS policy allowing the site's origin (Settings > CORS Policy):
   ```json
   [{ "AllowedOrigins": ["https://mopsa.example.org"], "AllowedMethods": ["GET"] }]
   ```
3. Upload the two files with wrangler (`npx wrangler login` first, or `CLOUDFLARE_API_TOKEN`), then build the frontend with their URL:
   ```sh
   make wasm-r2-upload R2_BUCKET=<bucket>
   make frontend-build MOPSA_ASSETS_URL=https://wasm.example.org   # or final-web
   ```
   and deploy `frontend/dist`, which no longer contains them.

The files go in a directory named after the hash of the build (`<bucket>/<hash>/ocamlrun.wasm`), as they must match the `ocamlrun.js` served with the page: an upload replaces nothing a deployed page uses, and they are cached for good. The directories of old builds stay in the bucket until deleted. The PWA caches them on first use instead of precaching them.

The `deploy` job of `.github/workflows/build.yml` does these steps after each build of `main`, and the weekly run builds and deploys only when Mopsa's commit differs from the one in the deployed `mopsa-build.json`. A push changing only `frontend/` (except `generateShareJson.sh` and `folderToJson.cjs`, which make `share.json`), `bench/`, the workflows, the README, `LICENSE` or `.gitignore` since the last build of `main` builds and deploys the frontend only, with the backends of that build (its artifact `frontend-public`, kept 90 days). A `workflow_dispatch` always builds everything. It needs the repository secrets `CLOUDFLARE_API_TOKEN` (with R2 and Pages edit permissions) and `CLOUDFLARE_ACCOUNT_ID`.

## Cleaning

```sh
make clean              # build/, dist/, _build/ and the jsoo outputs
make clean-docker       # remove the Docker image
```

The libraries ocaml-emcc built stay in the switch (`$OPAM_SWITCH_PREFIX/emcc-sysroot`), see `ocaml-emcc help`.

## Licence

This project is licensed under the [MIT License](LICENSE). The license covers only the code I authored: files at the root of the project, and those in `docker/`, `backend/` and `frontend/` (with the exception of `frontend/public/sync-message.js` and `backend/jsoo/vpl_domain.ml`).

All other code is owned by its respective authors and is not covered by this license. Please refer to the corresponding upstream projects (Mopsa, OCaml, LLVM/Clang, GMP, MPFR, Apron, etc.) for their own licensing terms.

## How it works

[ocaml-emcc](https://github.com/rboudrouss/ocaml-emcc) compiles the bytecode of `backend/wasm/mopsa_worker` to C with [c_of_ocaml](https://github.com/rboudrouss/C_of_ocaml), and builds OCaml's runtime with emscripten from the sources of the switch's compiler. The C stubs of every library the bytecode links (Mopsa's own, its Clang-based C parser, zarith, mlgmpidl, apron) are rebuilt with emcc and linked statically with them into a single `ocamlrun.wasm` (about 36 MB, a third of it the CPS versions of `cps-stack`; the file keeps the name of the interpreter it replaced). Clang's resource headers, the Linux 32-bit headers and the Mopsa stubs directory are preloaded into emscripten's virtual filesystem (`ocamlrun.data`).

The bytecode is the switch's (64-bit) one, compiled with 31-bit integers on wasm32: `ocaml-emcc` checks that every literal fits, and the patches of Mopsa avoid the computations that would overflow (C integers are zarith values).

## The js_of_ocaml backend

`backend/jsoo/` compiles the whole analyzer to plain JavaScript with [js_of_ocaml](https://ocsigen.org/js_of_ocaml/) (the approach of the official [try-mopsa](https://gitlab.com/rmonat/mopsa-web) page, whose js_of_ocaml version of Mopsa by Raphaël Monat much of this backend comes from), exposing the same `mopsaJs` API and worker protocol as the WASM backend. It is used automatically when the browser cannot run WebAssembly, or on demand via Options > Browser Compat.

It is feature-reduced compared to WASM:

- **No C / cross-language analysis** since the Clang parser is a C++ library. The analyzer is configured with `--disable-c`. Only Universal and Python.
- **Relational domains via [VPL](https://github.com/VERIMAG-Polyhedra/VPL)** ([rmonat's fork](https://github.com/rmonat/VPL)), a pure-OCaml polyhedra library, instead of Apron (a C library).
- All three engines work (`automatic`, `interactive`, `dap`) and sessions use the same SharedArrayBuffer stdin channel as WASM.

The analyzer is configured with `--disable-c` in a copy of the sources opam kept when installing Mopsa, patched as the wasm build (`build/mopsa-jsoo`, copied again after `make mopsa-update` or a change of the patches), and the worker is compiled against it with the host opam switch (`JSOO_SWITCH`, the same as `SWITCH` by default). js_of_ocaml gives 32-bit integers whatever the compiler, so no 32-bit toolchain is needed.

The frontend’s `share.json` is regenerated from Mopsa's share directory installed in the switch by `make jsoo-web` and served to the worker at runtime, so the two backends share the same stubs / config presets.

## Acknowledgements

The js_of_ocaml backend reuses much of the js_of_ocaml version of Mopsa that [Raphaël Monat](https://rmonat.fr/) wrote for [try-mopsa](https://gitlab.com/rmonat/mopsa-web).

The OCaml-to-WASM port was first built on [Vincent Chan](https://github.com/okcdz)'s work on `ocaml-wasm` (August 2021), which provided the original `configure` tweaks and the libs (`unix_lib.c`, `socketaddr.c`, `unixsupport.c`, ...) needed to run OCaml's runtime under emscripten.

[Binji's fork](https://github.com/binji/llvm-project) and [Binji's Notes](https://gist.github.com/binji/b7541f9740c21d7c6dac95cbc9ea6fca) helped a lot to figure out how to build LLVM/Clang.

The specific versions of mpfr & gmp that were easy to compile using emscripten were pointed by [this response](https://stackoverflow.com/a/43583154) in stackoverflow by Claude

## Project history

This project originally started as a university project for the PSTL course in [Sorbonne University's Master's program in Software Science and Technology](https://sciences.sorbonne-universite.fr/en/formation-sciences/masters/master-informatique/parcours-stl). The initial exploration using `js_of_ocaml` can be found in the [MOPSA analyzer js](https://gitlab.com/rboudrouss/mopsa-analyzer-js) repo, and the first WebAssembly-related experiments are available in its `wasm` branch.

Later, I continued working on the project in my spare time, and it eventually evolved into [mopsa-wasm](https://github.com/rboudrouss/mopsa-wasm), where you can find the various experiments, successes, and failures I encountered while exploring Emscripten and WASI.

The project has since found its way into this repository, where these efforts finally came together successfully.
