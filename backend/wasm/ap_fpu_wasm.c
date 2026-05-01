#include <stdbool.h>

/*
 * WebAssembly override for ap_fpu_init (Apron).
 *
 * WASM has no hardware FPU rounding mode control, so the default Apron
 * implementation would print a warning and return false.  This is harmless
 * for NUM_MPQ builds: all bound arithmetic uses exact GMP rationals, and
 * double conversions go through MPFR with an explicit GMP_RNDU argument.
 * Injected via -Wl,--wrap=ap_fpu_init in the link step.
 */
bool __wrap_ap_fpu_init(void) { return true; }
