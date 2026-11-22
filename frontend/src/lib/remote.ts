/**
 * The files a link opens (?open=SPEC): those of a GitHub repository or of
 * one of its folders, fetched through jsDelivr (which serves a repository's
 * files to other sites, where GitHub's archives have no CORS), or those of
 * an archive's URL (zip, tar, tar.gz). Only the sources Mopsa reads are
 * kept (.c, .h, .py, .u), not those of hidden folders, _build or
 * node_modules.
 */
import JSZip from "jszip";

export interface RemoteFile {
  path: string;
  content: string;
}

/** A GitHub repository's folder: owner/repo[@ref][:folder]. */
export interface GitHubFolder {
  owner: string;
  repo: string;
  ref: string | null;
  folder: string;
}

const SOURCE = /\.(c|h|py|u)$/;
export const isSource = (path: string) => SOURCE.test(path);

// (a file of a hidden folder, _build or node_modules)
const skipped = (path: string) =>
  path
    .split("/")
    .slice(0, -1)
    .some((d) => d.startsWith(".") || d === "_build" || d === "node_modules");

const kept = (path: string) => isSource(path) && !skipped(path);

// A folder's name from a repository's or an archive's.
const folderName = (n: string) =>
  n.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[.-]/, "_") || "project";

// owner/repo, owner/repo@ref, https://github.com/owner/repo[/tree/ref], or
// the URL of one of its archives (/archive/[refs/heads/|refs/tags/]REF.zip)
function gitHubRepository(
  spec: string,
): { owner: string; repo: string; ref: string | null } | null {
  const s = spec.trim();
  let m = /^([\w.-]+)\/([\w.-]+?)(?:@([^\s]+))?$/.exec(s);
  if (m) return { owner: m[1], repo: m[2], ref: m[3] ?? null };
  m =
    /^https?:\/\/(?:github\.com\/([\w.-]+)\/([\w.-]+)\/archive|codeload\.github\.com\/([\w.-]+)\/([\w.-]+)\/(?:zip|tar\.gz)|api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)\/(?:zip|tar)ball)\/(?:refs\/(?:heads|tags)\/)?([^?#]+?)(?:\.zip|\.tar\.gz)?(?:[?#].*)?$/.exec(
      s,
    );
  if (m)
    return {
      owner: m[1] ?? m[3] ?? m[5],
      repo: m[2] ?? m[4] ?? m[6],
      ref: m[7],
    };
  return null;
}

/**
 * A GitHub repository or one of its folders: owner/repo[@ref][:folder]
 * (git forbids ':' in a ref), https://github.com/owner/repo[/tree/REF[/FOLDER]]
 * (REF without '/' there), or one of its archives' URLs.
 */
export function gitHubFolder(spec: string): GitHubFolder | null {
  const s = spec.trim();
  const url =
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/?#]+)((?:\/[^?#]*)?))?\/?(?:[?#].*)?$/.exec(
      s,
    );
  if (url)
    return { owner: url[1], repo: url[2], ref: url[3] ?? null, folder: url[4] ?? "" };
  if (/^https?:/.test(s)) {
    const gh = gitHubRepository(s);
    return gh && { ...gh, folder: "" };
  }
  const [repo, ...rest] = s.split(":");
  const gh = gitHubRepository(repo);
  return gh && { ...gh, folder: rest.join(":") };
}

const trimSlashes = (f: string) => f.replace(/^\/+|\/+$/g, "");

/** Its spec in a link: owner/repo[@ref][:folder]. */
export const openSpec = ({ owner, repo, ref, folder }: GitHubFolder) =>
  `${owner}/${repo}${ref ? `@${ref}` : ""}${trimSlashes(folder) ? `:${trimSlashes(folder)}` : ""}`;

export const openable = (spec: string) =>
  gitHubFolder(spec) !== null || /^https?:\/\/\S+$/.test(spec.trim());

/** A commit's SHA. */
export const isCommit = (ref: string) => /^[0-9a-f]{40}$/i.test(ref);

/** The last commit of a repository at a ref (HEAD: its default branch). */
export async function latestCommit(
  owner: string,
  repo: string,
  ref = "HEAD",
): Promise<string> {
  if (isCommit(ref)) return ref;
  const r = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    { headers: { Accept: "application/vnd.github.sha" } },
  );
  if (r.status === 404 || r.status === 422)
    throw new Error(
      ref === "HEAD"
        ? `${owner}/${repo} is not a public GitHub repository`
        : `${owner}/${repo}@${ref} not found`,
    );
  if (r.status === 403 || r.status === 429)
    throw new Error(
      `GitHub refuses more requests for now (HTTP ${r.status}). Give a tag or a commit, as owner/repo@ref`,
    );
  if (!r.ok) throw new Error(`GitHub answered HTTP ${r.status}`);
  const sha = (await r.text()).trim();
  if (!isCommit(sha))
    throw new Error(`GitHub gave no commit for ${owner}/${repo}@${ref}`);
  return sha;
}

/** The spec pinned to the last commit of its ref, unless it names a commit. */
export async function pinnedSpec(gh: GitHubFolder): Promise<string> {
  if (gh.ref && isCommit(gh.ref)) return openSpec(gh);
  return openSpec({
    ...gh,
    ref: await latestCommit(gh.owner, gh.repo, gh.ref ?? "HEAD"),
  });
}

// ── Archives ──────────────────────────────────────────────────────────────────

// (data: read only for the files kept)
interface Entry {
  name: string;
  data: () => Promise<Uint8Array>;
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const out = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// ustar, with the long names of pax headers (path=) and GNU's (././@LongLink)
function untar(data: Uint8Array): Entry[] {
  const dec = new TextDecoder();
  const str = (at: number, n: number) => {
    const b = data.subarray(at, at + n);
    const end = b.indexOf(0);
    return dec.decode(end < 0 ? b : b.subarray(0, end));
  };
  const out: Entry[] = [];
  let long: string | null = null;
  for (let p = 0; p + 512 <= data.length; ) {
    if (data[p] === 0) break;
    const size = parseInt(str(p + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(data[p + 156] || 48);
    const prefix = str(p + 257, 6).startsWith("ustar") ? str(p + 345, 155) : "";
    const name = long ?? (prefix ? `${prefix}/${str(p, 100)}` : str(p, 100));
    const body = data.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
    long = null;
    if (type === "x") {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(dec.decode(body))?.[1];
      if (path) long = path;
    } else if (type === "L") long = dec.decode(body).replace(/\0.*$/s, "");
    else if (type === "0" || type === "7")
      out.push({ name, data: async () => body });
  }
  return out;
}

async function readArchive(name: string, data: Uint8Array): Promise<Entry[]> {
  if (data[0] === 0x1f && data[1] === 0x8b) return untar(await gunzip(data));
  if (data[0] === 0x50 && data[1] === 0x4b) {
    const zip = await JSZip.loadAsync(data);
    return Object.values(zip.files)
      .filter((f) => !f.dir)
      .map((f) => ({ name: f.name, data: () => f.async("uint8array") }));
  }
  if (/\.tar$/i.test(name) || new TextDecoder().decode(data.subarray(257, 262)) === "ustar")
    return untar(data);
  throw new Error(`${name} is not a zip, tar or tar.gz archive`);
}

// The sources of an archive, without the folder they are all in (a GitHub
// archive's REPO-REF/), which then names them.
async function archiveFiles(
  fileName: string,
  data: Uint8Array,
): Promise<{ name: string; files: RemoteFile[] }> {
  const entries = (await readArchive(fileName, data)).map((e) => ({
    path: e.name.replace(/^\.\//, ""),
    data: e.data,
  }));
  const tops = new Set(
    entries.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")),
  );
  const top = tops.size === 1 && !tops.has("") ? [...tops][0] : null;
  const dec = new TextDecoder();
  const files: RemoteFile[] = [];
  for (const e of entries) {
    const path = top ? e.path.slice(top.length + 1) : e.path;
    if (!kept(path)) continue;
    const data = await e.data();
    if (!data.includes(0)) files.push({ path, content: dec.decode(data) });
  }
  const base = (top ?? fileName.split("/").pop()!).replace(
    /\.(zip|tar|tar\.gz|tgz)$/i,
    "",
  );
  return { name: folderName(base), files };
}

async function download(spec: string) {
  let r: Response;
  try {
    r = await fetch(spec.trim());
  } catch {
    throw new Error(
      `${spec} could not be downloaded, its server may not let other sites download it (CORS). Download it, then import its files`,
    );
  }
  if (!r.ok) throw new Error(`${spec}: HTTP ${r.status}`);
  return [
    new URL(spec.trim()).pathname,
    new Uint8Array(await r.arrayBuffer()),
  ] as const;
}

// ── GitHub, through jsDelivr ──────────────────────────────────────────────────

async function json<T>(url: string, missing: string): Promise<T> {
  const r = await fetch(url);
  if (r.status === 404) throw new Error(missing);
  if (r.status === 403 || r.status === 429)
    throw new Error(
      `${url}: HTTP ${r.status}, too many requests for now (give a tag or a commit: owner/repo@ref)`,
    );
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// Files of a repository at owner/repo@ref, 8 at a time
async function jsDelivrFiles(
  at: string,
  paths: string[],
  progress: (done: number, total: number) => void,
): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++];
      const r = await fetch(`https://cdn.jsdelivr.net/gh/${at}/${path}`);
      if (!r.ok) throw new Error(`${at}/${path}: HTTP ${r.status}`);
      const content = await r.text();
      if (!content.includes("\0")) files.push({ path, content });
      progress(files.length, paths.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return files;
}

const byPath = (a: RemoteFile, b: RemoteFile) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * The sources a link opens, the folder they go to (named as the
 * repository's folder, else the repository or the archive), and the spec at
 * the commit fetched when it named no version (pinned).
 */
export async function fetchProject(
  spec: string,
  progress: (done: number, total: number) => void,
): Promise<{ name: string; files: RemoteFile[]; pinned?: string }> {
  const gh = gitHubFolder(spec);
  if (!gh) {
    const { name, files } = await archiveFiles(...(await download(spec)));
    return { name, files: files.sort(byPath) };
  }
  const ref = gh.ref ?? (await latestCommit(gh.owner, gh.repo));
  const at = `${gh.owner}/${gh.repo}@${ref}`;
  const folder = trimSlashes(gh.folder);
  const pinned = gh.ref === null ? openSpec({ ...gh, ref, folder }) : undefined;
  const listing = await json<{ files: { name: string }[] }>(
    `https://data.jsdelivr.com/v1/packages/gh/${at}?structure=flat`,
    `${at} not found: no public repository with this branch, tag or commit`,
  );
  const prefix = folder ? `${folder}/` : "";
  const paths = listing.files
    .map((f) => f.name.replace(/^\//, ""))
    .filter((p) => p.startsWith(prefix));
  if (folder && paths.length === 0) throw new Error(`${at} has no folder ${folder}`);
  const files = (
    await jsDelivrFiles(
      at,
      paths.filter((p) => kept(p.slice(prefix.length))),
      progress,
    )
  ).map((f) => ({ path: f.path.slice(prefix.length), content: f.content }));
  return {
    name: folderName(folder.split("/").pop() || gh.repo),
    files: files.sort(byPath),
    ...(pinned && { pinned }),
  };
}
