/* Stubs for POSIX libc functions that emscripten does not implement but that
 * OCaml 5's Unix otherlib C stubs reference at link time.  Mopsa's analysis
 * never actually calls these (they exist only so caml_unix_* primitives can be
 * placed in the builtin primitive table), so a failing ENOSYS stub is safe. */
#include <errno.h>
#include <signal.h>

/* sigsuspend: referenced by unix/signals.c (caml_unix_sigsuspend). */
int sigsuspend(const sigset_t *mask) {
  (void)mask;
  errno = ENOSYS;
  return -1;
}
