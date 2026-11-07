/* Sys.time (OCaml's caml_sys_time) reads getrusage, which emscripten stubs
 * with constant times (weak __syscall_getrusage in its libc): Mopsa's
 * analysis time, Timing and function_profiler read 0 elapsed seconds.
 * A browser has no CPU time; report the time since the worker started. */

#include <string.h>
#include <sys/resource.h>
#include <emscripten/emscripten.h>

int __syscall_getrusage(int who, struct rusage *usage)
{
  double ms = emscripten_get_now();
  long long us = (long long)(ms * 1000.0);
  (void)who;
  memset(usage, 0, sizeof *usage);
  usage->ru_utime.tv_sec = (time_t)(us / 1000000);
  usage->ru_utime.tv_usec = (suseconds_t)(us % 1000000);
  return 0;
}
