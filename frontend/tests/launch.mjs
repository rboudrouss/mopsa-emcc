// The browser of the tests: Chromium from playwright, in PLAYWRIGHT_DIR
// (default ~/tools/pw)
import { createRequire } from "node:module";
import { join } from "node:path";

const dir = process.env.PLAYWRIGHT_DIR ?? join(process.env.HOME, "tools/pw");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(dir, "browsers");
const playwright = createRequire(join(dir, "package.json"))("playwright");

export const launch = (options = {}) => playwright.chromium.launch(options);
