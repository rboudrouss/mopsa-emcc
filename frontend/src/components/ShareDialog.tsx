import { type ReactNode, useEffect, useRef, useState } from "react";
import { CodeIcon, CopyIcon, FolderInputIcon, InfoIcon, LinkIcon, XIcon } from "lucide-react";
import { gitHubFolder, openable, openSpec, pinnedSpec } from "@/lib/remote";
import {
  activePath,
  collectShared,
  embedCode,
  embedUrl,
  longUrl,
  maxUrl,
  shareUrl,
} from "@/lib/share";
import { useAppStore } from "@/lib/store";
import { getAllFilePaths, getWorkspaceForFile } from "@/lib/tree";
import type { OpenedFolder } from "@/lib/types";

/**
 * The Share button's dialog: a link, or the HTML that embeds the page in
 * another one, made again and copied at each change of what it shares: the
 * current file, its workspace or all the files, the analysis settings, the
 * folders opened from a repository or an archive (?open=SPEC: their files
 * then left out, the current one ?file=NAME), others for the link only (a
 * GitHub repository pinned to its last commit by default), a temporary
 * session (?temp: by default when it opens folders; an embed always is
 * one). A warning when the link is too long, and (i) buttons that tell more.
 */

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
const openSource = (o: OpenedFolder) => o.pinned ?? o.source;

// A heading or a line with an (i) that shows, under it, more about it
function More({ children, more }: { children: ReactNode; more: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="with-info">
        {children}
        <button
          type="button"
          className="info"
          aria-expanded={open}
          aria-label="More about this"
          title="More about this"
          onClick={() => setOpen(!open)}
        >
          <InfoIcon size={13} />
        </button>
      </div>
      {open && <div className="info-text">{more}</div>}
    </>
  );
}

export function ShareDialog({ close }: { close: () => void }) {
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const recorded = useAppStore((s) => s.opened);

  const active = activePath();
  const workspace = activeFile ? getWorkspaceForFile(fileTree, activeFile) : null;
  const paths = getAllFilePaths(fileTree).map((f) => f.path);
  const under = (p: string, dir: string) => p.startsWith(`${dir}/`);
  // (the folders opened by a link that are still there)
  const opened = recorded.filter((o) => paths.some((p) => under(p, o.folder)));

  const [embed, setEmbed] = useState(false);
  // (a temporary session, chosen: else when the link opens folders)
  const [temp, setTemp] = useState<boolean | null>(null);
  const [file, setFile] = useState(active !== "");
  const [ws, setWs] = useState(workspace !== null);
  const [all, setAll] = useState(false);
  const [settings, setSettings] = useState(true);
  const [pin, setPin] = useState(true);
  // (the folders the link opens from their source, checked; those added
  // here; the form's)
  const [openChecked, setOpenChecked] = useState(() => new Set<string>());
  const [openExtra, setOpenExtra] = useState<string[]>([]);
  const [spec, setSpec] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [told, setTold] = useState("");
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // (the folders the link opens: their files left out, the current one
  // named by ?file)
  const reopened = opened.filter((o) => openChecked.has(openSource(o))).map((o) => o.folder);
  const inReopened = (p: string) => reopened.some((d) => under(p, d));
  const activeFolder = reopened.find((d) => under(active, d));
  const allFiles = paths.filter((p) => !inReopened(p));
  const wsFiles = workspace ? allFiles.filter((p) => under(p, workspace)) : [];
  const shared = all
    ? allFiles
    : ws && workspace
      ? wsFiles
      : file && active && !activeFolder
        ? [active]
        : [];
  const opens = [...opened.map(openSource), ...openExtra].filter((s) => openChecked.has(s));
  const shownFile =
    activeFolder && (file || ws || all) ? active.slice(activeFolder.length + 1) : undefined;
  const temporary = embed || (temp ?? opens.length > 0);
  const text = embed ? embedCode(embedUrl(link)) : link;

  const copy = (t: string) =>
    navigator.clipboard?.writeText(t).then(
      () => true,
      () => false,
    ) ?? Promise.resolve(false);

  // The link made again, and copied
  const key = JSON.stringify([shared, settings, opens, shownFile, embed, temporary]);
  useEffect(() => {
    let current = true;
    shareUrl(collectShared(shared, settings), undefined, {
      open: opens,
      file: shownFile,
      temp: temporary && !embed,
    }).then(async (u) => {
      if (!current) return;
      setLink(u);
      const ok = await copy(embed ? embedCode(embedUrl(u)) : u);
      if (!current) return;
      const what = [
        shared.length && plural(shared.length, "file"),
        opens.length && plural(opens.length, "opened folder"),
      ].filter(Boolean);
      setTold(
        `${embed ? "Embed" : temporary ? "Temporary link" : "Link"}${what.length ? ` with ${what.join(" and ")}` : ""}${settings ? ", config and options" : ""} ${ok ? "copied" : "made"} (${(embed ? embedUrl(u) : u).length} characters)`,
      );
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [close]);

  const toggleOpen = (source: string) =>
    setOpenChecked((c) => {
      const n = new Set(c);
      if (n.has(source)) n.delete(source);
      else n.add(source);
      return n;
    });

  // A folder for the link to open: a GitHub repository's (pinned to the
  // last commit of its ref if asked), an archive's URL as it is
  const addOpen = async () => {
    const s = spec.trim();
    if (!s || adding) return;
    setError(null);
    if (!openable(s))
      return setError(
        `${s} is neither a GitHub repository (owner/repo[:folder]) nor an archive's URL`,
      );
    const gh = gitHubFolder(s);
    setAdding(true);
    try {
      const source = gh ? (pin ? await pinnedSpec(gh) : openSpec(gh)) : s;
      if (!opened.some((o) => openSource(o) === source))
        setOpenExtra((e) => (e.includes(source) ? e : [...e, source]));
      setOpenChecked((c) => new Set(c).add(source));
      setSpec("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const length = embed ? embedUrl(link).length : link.length;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog share-dialog" role="dialog" aria-label="Share">
        <div className="dialog-title">
          <h2>Share</h2>
          <button className="icon" onClick={close} aria-label="Close" title="Close">
            <XIcon size={16} />
          </button>
        </div>

        <More
          more={
            <>
              <p>
                <b>Link</b> opens Mopsa with what is checked below. The files travel inside the
                link, after its <code>#</code>, and are never uploaded.
              </p>
              <p>
                <b>Embed</b> gives an <code>&lt;iframe&gt;</code> to paste in another site, such as
                a course or a blog: the editor and the results. It keeps its files in memory and
                saves nothing in the visitor's browser.
              </p>
              <p>
                The analysis runs in any page. The REPL and the abstract states need the page
                around it to be cross-origin isolated: serve that page with{" "}
                <code>Cross-Origin-Opener-Policy: same-origin</code> and{" "}
                <code>Cross-Origin-Embedder-Policy: require-corp</code>, or{" "}
                <code>credentialless</code>, which is less strict with the page's other resources.
                This HTML already has the <code>allow="cross-origin-isolated"</code> attribute that
                the iframe also needs.
              </p>
            </>
          }
        >
          <div className="segmented" role="group" aria-label="What to share">
            <button aria-pressed={!embed} onClick={() => setEmbed(false)}>
              <LinkIcon size={13} /> Link
            </button>
            <button aria-pressed={embed} onClick={() => setEmbed(true)}>
              <CodeIcon size={13} /> Embed
            </button>
          </div>
        </More>
        <div className="share-link">
          {embed ? (
            <textarea
              ref={field}
              readOnly
              rows={4}
              value={text}
              aria-label="The HTML"
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <input
              ref={field}
              readOnly
              value={text}
              aria-label="The link"
              onFocus={(e) => e.target.select()}
            />
          )}
          <button
            className="button"
            onClick={async () => (await copy(text)) || field.current?.select()}
            title={embed ? "Copy the HTML" : "Copy the link"}
          >
            <CopyIcon size={13} /> Copy
          </button>
        </div>
        {told && <p className="muted share-told">{told}</p>}
        {length > maxUrl ? (
          <p className="share-warning error">
            Chrome and Edge cannot open links over 2 MB. Share fewer files, or open them from a
            repository or an archive.
          </p>
        ) : (
          length > longUrl && (
            <p className="share-warning">
              Chat apps, mail and some sites may cut links over 8 KB. Share fewer files, or open
              them from a repository or an archive.
            </p>
          )
        )}

        <More
          more={
            <p>
              The visitor's own files and settings stay untouched, and closing the page forgets the
              session. A button lets them keep its files. An embed is always temporary.
            </p>
          }
        >
          <label>
            <input
              type="checkbox"
              checked={temporary}
              disabled={embed}
              onChange={(e) => setTemp(e.target.checked)}
            />
            <span>
              Temporary session{" "}
              <span className="muted">
                {embed ? "always, for an embed" : "nothing saved in the visitor's browser"}
              </span>
            </span>
          </label>
        </More>

        <More
          more={
            <p>
              Opening the link copies the files into the visitor's browser, unless the session is
              temporary. A file whose path they already use with another text is renamed, as{" "}
              <code>a_1.c</code> or a folder <code>w_2/</code>. A C or C+Python analysis reads
              every file of its workspace: share the workspace for it to run the same.
            </p>
          }
        >
          <h3>Files</h3>
        </More>
        <label>
          <input
            type="checkbox"
            checked={file || ws || all}
            disabled={ws || all || !active}
            onChange={(e) => setFile(e.target.checked)}
          />
          <span>
            This file{" "}
            <span className="muted">
              {active || "none"}
              {activeFolder && `, opened from ${activeFolder}/'s source`}
            </span>
          </span>
        </label>
        {workspace && (
          <label>
            <input
              type="checkbox"
              checked={ws || all}
              disabled={all}
              onChange={(e) => setWs(e.target.checked)}
            />
            <span>
              Its workspace{" "}
              <span className="muted">
                {workspace}/, {plural(wsFiles.length, "file")}
              </span>
            </span>
          </label>
        )}
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>
            All files <span className="muted">{plural(allFiles.length, "file")}</span>
          </span>
        </label>

        <More
          more={
            <p>
              The link sets the configuration shown (its preset, or its text when edited), the
              options that differ from their defaults and the Python entry point. They replace the
              visitor's, only for the session when it is temporary.
            </p>
          }
        >
          <label>
            <input
              type="checkbox"
              checked={settings}
              onChange={(e) => setSettings(e.target.checked)}
            />
            <span>
              Configuration and options{" "}
              <span className="muted">the analysis runs as here</span>
            </span>
          </label>
        </More>

        <More
          more={
            <>
              <p>
                The link fetches the checked folders again from their GitHub repository or archive,
                with one <code>?open=</code> each, instead of carrying their files: it stays short
                whatever their size. If This file is in one of them, <code>&amp;file=</code> opens
                it. Only the sources Mopsa reads are fetched (.c, .h, .py, .u).
              </p>
              <p>Changes made to these files since they were opened are not in the link.</p>
            </>
          }
        >
          <h3>Opened folders</h3>
        </More>
        {opened.map((o) => (
          <label key={o.folder}>
            <input
              type="checkbox"
              checked={openChecked.has(openSource(o))}
              onChange={() => toggleOpen(openSource(o))}
            />
            <span>
              {o.folder}/ <span className="muted">{openSource(o)}</span>
            </span>
          </label>
        ))}
        {openExtra.map((s) => (
          <label key={s}>
            <input type="checkbox" checked={openChecked.has(s)} onChange={() => toggleOpen(s)} />
            <span>
              {s} <span className="muted">link only</span>
            </span>
          </label>
        ))}
        <form
          className="share-add"
          onSubmit={(e) => {
            e.preventDefault();
            void addOpen();
          }}
        >
          <input
            placeholder="owner/repo@tag:folder, a GitHub folder's URL or an archive's URL"
            aria-label="A folder for the link to open"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
          />
          <button
            type="submit"
            className="button"
            disabled={!spec.trim() || adding}
            title="Add it to the link"
          >
            <FolderInputIcon size={13} /> {adding ? "…" : "Add"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <More
          more={
            <>
              <p>
                This applies to the folders added here. GitHub allows 60 requests per hour per IP
                address, and a repository without a version costs one per visitor, or one per load
                for an embed. A classroom or a campus behind a single address (NAT) can run out, and
                the folder then stops loading for everyone there. With a version in the link, only
                jsDelivr is asked.
              </p>
              <p>
                Pinning also gives everyone exactly the same code, which matters for a course. A
                commit never changes, whereas a branch moves and jsDelivr caches it for hours, and a
                tag can be moved.
              </p>
            </>
          }
        >
          <label className="muted">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            <span>Pin GitHub repositories to their latest commit</span>
          </label>
        </More>
      </div>
    </div>
  );
}
