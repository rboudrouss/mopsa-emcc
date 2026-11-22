/**
 * The page embedded in another (?embed), or a temporary session (?temp: a
 * course, a demo). Both keep their files, config and options in memory for
 * the page's lifetime, and neither read nor change the visitor's saved
 * state. The page's settings (theme, layout, backend) stay the visitor's.
 */
const params = new URLSearchParams(location.search);
export const embedded = params.has("embed");
export const temporary = embedded || params.has("temp");
