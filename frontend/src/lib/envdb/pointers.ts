/**
 * The values of C pointers made readable for the inline values.
 *
 * Mopsa prints the bases a pointer may point to: a variable ("a"), a string
 * literal ("\"hi\""), NULL, or a heap block named by its allocation site and
 * the call stack there, "@Memory:malloc@./main.c:6.11-34 → main@./main.c:4.4-8:…",
 * "✗@…" once freed. Its offset, in bytes, is a numeric variable of its own,
 * "offset⦃p⦄".
 */

const HEAP = /^(✗)?@[^:]*:([^@\s]+)@(?:\.\/)?([^:\s]*):(\d+)\.\d+(?:-\d+(?:\.\d+)?)?(?:\s*→.*)?$/;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** One base: "&a", "\"hi\"", "NULL", "malloc@6", "freed malloc@6" (the file
 *  too when not `file`'s). */
export function baseText(base: string, file?: string): string {
  const m = HEAP.exec(base);
  if (m) {
    const [, freed, fn, site, line] = m;
    const where = file && basename(site) === basename(file) ? line : `${basename(site)}:${line}`;
    return `${freed ? "freed " : ""}${fn}@${where}`;
  }
  if (/^[A-Za-z_$][\w$.]*$/.test(base) && base !== "NULL" && base !== "INVALID") return `&${base}`;
  return base;
}

/** A pointer: its bases, with the offset when not 0 ("&a + 8"). */
export function pointerText(bases: string[], offset: string | undefined, file?: string): string {
  const off =
    offset === undefined || offset === "[0,0]"
      ? ""
      : /^\[(-?\d+),\1\]$/.test(offset)
        ? offset.replace(/^\[(-?\d+),.*$/, "$1")
        : offset;
  const texts = bases.map((b) => {
    const t = baseText(b, file);
    return off && t !== "NULL" && t !== "INVALID" ? `${t} + ${off}` : t;
  });
  return texts.length === 1 ? texts[0] : `{${texts.join(", ")}}`;
}
