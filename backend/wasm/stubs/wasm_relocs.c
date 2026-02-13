/* Stub for __wasm_apply_data_relocs.
 * Emscripten 4.x JS glue expects this export for MAIN_MODULE but
 * wasm-ld no longer generates it (incompatible with --export-table).
 * The main module doesn't need runtime data relocations, so a no-op is safe. */
void __wasm_apply_data_relocs(void) {}
