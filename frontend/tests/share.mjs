// The Share dialog and what its links open (headless Chromium):
//   - a link to a workspace: its files in the visitor's tree, beside their
//     own folder of the same name (c-single_2), the URL cleaned, saved;
//   - a link of the first version (v1) still opens;
//   - a temporary session (?temp): the examples make way for the link's
//     files, nothing saved, told in the top bar; Keep these files (in its
//     popover) writes them into the visitor's saved state, beside theirs,
//     and loads the page without the link, told;
//   - ?open= an archive's URL (served with CORS): its sources only, in a
//     workspace, ?file= opened, recorded; the dialog lists it, puts it in a
//     link as ?open= with &file=, a temporary session by default;
//   - ?embed: no panels, the files to switch between, Open in Mopsa,
//     nothing saved; in a cross-origin isolated page, the iframe loads and
//     is isolated too.
//   node tests/share.mjs [URL]   (default http://localhost:5173/, `pnpm dev`)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { launch } from "./launch.mjs";

const url = process.argv[2] ?? process.env.MOPSA_URL ?? "http://localhost:5173/";
const browser = await launch();
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

async function fresh(seed = null, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({
    viewport,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript((seed) => {
    if (sessionStorage.getItem("started")) return;
    sessionStorage.setItem("started", "1");
    localStorage.clear();
    if (seed) localStorage.setItem("mopsa-state", seed);
  }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  page.on("dialog", (d) => d.accept());
  return page;
}
const editorText = (page) =>
  page.evaluate(() =>
    (document.querySelector(".monaco-editor .view-lines")?.textContent ?? "").replace(/ /g, " "),
  );
const waitEditor = (page, text) =>
  page.waitForFunction(
    (t) => (document.querySelector(".monaco-editor .view-lines")?.textContent ?? "").replace(/ /g, " ").includes(t),
    text,
  );
const saved = (page) =>
  page.evaluate(() => {
    const s = localStorage.getItem("mopsa-state");
    return s && JSON.parse(s);
  });
const savedPaths = async (page) => Object.keys((await saved(page))?.fileContents ?? {}).sort();
// (saved once the analysis is over: the state is saved a second after its
// last change)
const savedWith = (page, path) =>
  page.waitForFunction(
    (p) => JSON.parse(localStorage.getItem("mopsa-state") ?? "{}").fileContents?.[p] !== undefined,
    path,
  );
// (copied once made)
const copied = (page, text) =>
  page
    .waitForFunction(async (t) => (await navigator.clipboard.readText()) === t, text, { timeout: 5000 })
    .then(() => true, () => false);
const linkOf = async (page) => {
  await page.waitForFunction(() => document.querySelector('input[aria-label="The link"]')?.value);
  return page.inputValue('input[aria-label="The link"]');
};

// ── A link to a workspace ─────────────────────────────────────────────────────
let page = await fresh();
await page.goto(url);
await page.waitForSelector(".monaco-editor");
await page.click(".monaco-editor .view-lines");
await page.keyboard.press("Control+Home");
await page.keyboard.type("/* shared */");
await page.click('button[aria-label="Share"]');
let link = await linkOf(page);
check(link.includes("#share=") && !link.includes("?"), `a link with the files only: ${link.slice(0, 60)}…`);
check(await copied(page, link), "the link in the clipboard");
await page.getByText("All files").click();
await page.waitForFunction((l) => document.querySelector('input[aria-label="The link"]').value !== l, link);
check(
  await copied(page, await page.inputValue('input[aria-label="The link"]')),
  "all files: another link, copied",
);
await page.getByText("All files").click();
await page.waitForFunction((l) => document.querySelector('input[aria-label="The link"]').value === l, link);
const workspaceLink = await linkOf(page);
await page.close();

page = await fresh();
await page.goto(workspaceLink);
await waitEditor(page, "/* shared */");
await savedWith(page, "c-single_2/example.c");
check(!page.url().includes("#"), `the URL cleaned: ${page.url()}`);
const paths = await savedPaths(page);
check(paths.includes("c-single_2/example.c") && paths.includes("c-single/example.c"), `beside the visitor's folder: ${paths.join(" ")}`);
check((await saved(page)).fileTree.find((n) => n.name === "c-single_2")?.isWorkspace, "a workspace");
await page.close();

// ── A link of the first version ───────────────────────────────────────────────
const v1 = {
  v: 1,
  ws: "demo",
  files: { "a.c": "int main(void) { return 1 / 1; }\n" },
  active: "a.c",
  preset: "default.json",
  options: {},
};
const v1Link = `${url}#share=z${deflateRawSync(JSON.stringify(v1)).toString("base64url")}`;
page = await fresh();
await page.goto(v1Link);
await waitEditor(page, "return 1 / 1");
await savedWith(page, "demo/a.c").catch(() => {});
check((await savedPaths(page)).includes("demo/a.c"), "a v1 link opens in its workspace");
await page.close();

// ── A temporary session ───────────────────────────────────────────────────────
page = await fresh();
const temporaryLink = workspaceLink.replace("/#", "/?temp#");
await page.goto(temporaryLink);
await waitEditor(page, "/* shared */");
await page.waitForTimeout(3000);
check((await saved(page)) === null, "nothing saved");
check(page.url().includes("?temp#share="), "the URL kept");
const badge = page.getByRole("button", { name: "Temporary session" });
check(await badge.isVisible(), "told in the top bar");
await badge.click();
check(await page.getByText("Nothing is saved in this browser").isVisible(), "what it means, once clicked");
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/temporary.png` });
check(!(await page.getByText("c-multifile").count()), "the examples gone");
check((await page.getByText("c-single", { exact: true }).count()) === 1, "the link's folder under its own name");
await page.getByRole("button", { name: "Keep these files" }).click();
await page.waitForURL((u) => !u.search.includes("temp"));
await page.waitForSelector("text=Kept 1 files in this browser");
check(await page.getByText("the session's are in c-single_2/").isVisible(), "the renamed folder told");
const kept = await savedPaths(page);
check(kept.includes("c-single_2/example.c") && kept.includes("c-multifile/main.c"), `kept beside the examples: ${kept.join(" ")}`);
check((await saved(page)).fileTree.find((n) => n.name === "c-single_2")?.isWorkspace, "kept as a workspace");
await waitEditor(page, "/* shared */");
check(true, "the kept file open");
await page.close();

// ── ?open= an archive ─────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "mopsa-share-"));
mkdirSync(join(dir, "course/lib"), { recursive: true });
writeFileSync(join(dir, "course/a.c"), "int a(void) { return 0; }\n");
writeFileSync(join(dir, "course/lib/b.c"), "int b(void) { return 2; }\n");
writeFileSync(join(dir, "course/README.md"), "# not a source\n");
execFileSync("zip", ["-qr", "course.zip", "course"], { cwd: dir });
const zip = readFileSync(join(dir, "course.zip"));
const server = createServer((_, res) => {
  res.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Type": "application/zip",
  });
  res.end(zip);
}).listen(0);
const archive = `http://localhost:${server.address().port}/course.zip`;

page = await fresh();
await page.goto(`${url}?open=${encodeURIComponent(archive)}&file=lib/b.c`);
await waitEditor(page, "return 2");
await savedWith(page, "course/a.c");
await page.waitForFunction(() => JSON.parse(localStorage.getItem("mopsa-state")).opened?.length);
const opened = await saved(page);
check(page.url() === url, `the URL cleaned: ${page.url()}`);
check(
  JSON.stringify(Object.keys(opened.fileContents).filter((p) => p.startsWith("course/")).sort()) ===
    JSON.stringify(["course/a.c", "course/lib/b.c"]),
  "the archive's sources only, in course/",
);
check(opened.fileTree.find((n) => n.name === "course")?.isWorkspace, "a workspace");
check(opened.opened?.[0]?.folder === "course" && opened.opened[0].source === archive, "recorded with its source");
await page.click('button[aria-label="Share"]');
await page.locator(".dialog label", { hasText: archive }).click();
link = await page.waitForFunction(() => {
  const v = document.querySelector('input[aria-label="The link"]').value;
  return v.includes("open=") && v;
}).then((h) => h.jsonValue());
const u = new URL(link);
check(u.search.startsWith("?temp&") && u.searchParams.get("open") === archive && u.searchParams.get("file") === "lib/b.c", `?open= and &file=, temporary: ${u.search}`);
check(await page.getByText("opened from course/'s source").isVisible(), "this file from the folder's source");
await page.close();

page = await fresh();
await page.goto(link);
await waitEditor(page, "return 2");
await page.waitForTimeout(3000);
check((await saved(page)) === null, "the folder's link opens a temporary session");
check(!(await page.getByText("c-multifile").count()), "with the link's folder only");
await page.close();

// ── ?embed ────────────────────────────────────────────────────────────────────
const embedLink = workspaceLink.replace("/#", "/?embed#");
page = await fresh();
await page.goto(embedLink);
await waitEditor(page, "/* shared */");
await page.waitForTimeout(3000);
check((await saved(page)) === null, "an embed saves nothing");
check(!(await page.getByText("Temporary session").count()), "no temporary session in the top bar");
check(!(await page.locator('button[aria-label="Share"]').count()), "no Share button");
check(await page.getByRole("button", { name: "Open in Mopsa" }).isVisible(), "Open in Mopsa");
check(!(await page.getByText("Files", { exact: true }).count()), "no panels");
const [popup] = await Promise.all([
  page.context().waitForEvent("page"),
  page.getByRole("button", { name: "Open in Mopsa" }).click(),
]);
await waitEditor(popup, "/* shared */");
await savedWith(popup, "c-single_2/example.c");
check(!popup.url().includes("embed"), "Open in Mopsa: the files, not embedded, saved");
await page.close();

// In a cross-origin isolated page
const parent = createServer((_, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });
  res.end(
    `<!doctype html><iframe src="${embedLink.replace(/"/g, "&quot;")}" allow="cross-origin-isolated" width="1000" height="600"></iframe>`,
  );
}).listen(0);
page = await fresh();
await page.goto(`http://127.0.0.1:${parent.address().port}/`);
const frame = await page.waitForFunction(() => document.querySelector("iframe")).then(() => page.frames()[1]);
await frame.waitForFunction(() =>
  (document.querySelector(".monaco-editor .view-lines")?.textContent ?? "").replace(/ /g, " ").includes("/* shared */"),
);
check(await page.evaluate(() => crossOriginIsolated), "the page isolated");
check(await frame.evaluate(() => crossOriginIsolated), "the embed isolated too");
await page.close();

server.close();
parent.close();
await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
