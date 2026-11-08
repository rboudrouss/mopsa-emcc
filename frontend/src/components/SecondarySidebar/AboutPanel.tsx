import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { getBackend } from "@/lib/backend";

const MONO = "'JetBrains Mono', monospace";

const LINKS = {
  mopsa: "https://mopsa.lip6.fr/",
  manual: "https://mopsa.gitlab.io/mopsa-analyzer/user-manual/",
  upstream: "https://gitlab.com/mopsa/mopsa-analyzer",
  fork: "https://gitlab.com/rboudrouss/mopsa-analyzer-32-bit",
  forkCommits: "https://gitlab.com/rboudrouss/mopsa-analyzer-32-bit/-/commits/main",
  interface: "https://github.com/rboudrouss/mopsa-emcc",
  ocamlEmcc: "https://github.com/rboudrouss/ocaml-emcc",
  tryMopsa: "https://try-mopsa.rmonat.fr/",
  vstte19: "https://rmonat.fr/publication/vstte19/",
};

/** Universal's grammar, from the parser of the Mopsa version shipped here
 *  (parsers/universal/U_parser.mly). */
const GRAMMAR = `program ::= decl* stmt*

decl    ::= type ID;
          | type ID = expr;
          | rettype ID (type ID, ...)
              { decl* stmt* }

type    ::= int | real | char
          | string | str
          | type array
rettype ::= void | type

stmt    ::= expr = expr;
          | expr;
          | { stmt* }
          | if (expr) stmt
          | if (expr) stmt else stmt
          | while (expr) stmt
          | for (ID, expr, expr) stmt
          | break;
          | continue;
          | return;
          | return expr;
          | assert (expr);
          | assume (expr);
          | print ();

expr    ::= INT | REAL
          | STRING | CHAR
          | true | false | ()
          | [ expr; ... ]
          | ID
          | expr [ expr ]
          | ID (expr, ...)
          | unop expr
          | expr binop expr
          | (expr)
          | rand (INT, INT)
          | randf (REAL, REAL)
          | rand ()
          | '|' expr '|'

unop    ::= + | - | ! | round
binop   ::= * | / | + | - | @
          | < | > | <= | >= | == | !=
          | && | ||`;

const GRAMMAR_NOTES: [string, string][] = [
  ["for (x, a, b) s", "runs s for x from a to b, both included"],
  ["assert (e)", "Mopsa raises an alarm unless it proves e"],
  ["assume (e)", "the analysis goes on in the states where e holds"],
  ["print ()", "prints the abstract state in the output"],
  ["rand (a, b)", "an integer in [a, b], a and b literals"],
  ["randf (a, b)", "a real in [a, b]"],
  ["rand ()", "a string"],
  ["| e |", "the length of the string e"],
  ["a @ b", "the concatenation of the strings a and b"],
  ["true, false", "1 and 0"],
];

const GRAMMAR_EXAMPLE = `int x = 0;
int i;
string s;

int succ(int n) {
  return n + 1;
}

x = succ(rand(0, 10));
assert(x >= 1);
s = rand();
s = s @ "ab";
for (i, 1, x) {
  print();
}`;

export function AboutPanel() {
  const { data: version } = useQuery({
    queryKey: ["mopsa-version", getBackend()],
    queryFn: async () => {
      const { output } = await mopsaJs.query(["-v"]);
      return /^\S+/.exec(output.trim())?.[0] ?? null;
    },
    staleTime: Infinity,
    retry: false,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", paddingBottom: 16 }}>
      <Header>About</Header>

      <Section title="Mopsa" initiallyOpen>
        <P>
          <A href={LINKS.mopsa}>Mopsa</A> (Modular and Open Platform for Static
          Analysis) is a framework for building sound static analyzers based on
          abstract interpretation. It over-approximates the states a program can
          reach, so it reports every error of the kinds it checks, along with
          possible false alarms.
        </P>
        <P>
          It analyses C, Python, programs mixing C and Python, and Universal,
          a small imperative language. Its abstract domains are independent
          modules, combined by a JSON configuration (Domains panel), as
          described in the <A href={LINKS.vstte19}>VSTTE&apos;19 paper</A>.
        </P>
        <P>
          Mopsa is distributed under the LGPL 3.0 or later. Its{" "}
          <A href={LINKS.manual}>user manual</A> documents the analyses and
          their options.
        </P>
      </Section>

      <Section title="This version" initiallyOpen>
        <P>
          The analysis runs in the browser, on two backends (Options panel):
        </P>
        <Ul>
          <li>
            WebAssembly: Mopsa and its C libraries (Clang, GMP, MPFR, Apron)
            compiled to wasm32 with <A href={LINKS.ocamlEmcc}>ocaml-emcc</A>.
            Every language.
          </li>
          <li>
            JavaScript: Mopsa compiled with js_of_ocaml. Lighter, Python and
            Universal only.
          </li>
        </Ul>
        <Row label="Mopsa">
          <span style={{ fontFamily: MONO }}>{version ?? "…"}</span>, from the
          main branch of <A href={LINKS.fork}>a fork</A> of{" "}
          <A href={LINKS.upstream}>upstream Mopsa</A> as of April 2026.
        </Row>
        <P>The fork adds to upstream Mopsa:</P>
        <Ul>
          <li>
            fixes for 32-bit targets: OCaml integers have 31 bits on wasm32,
            and WebAssembly has no directed float rounding;
          </li>
          <li>
            requests of the debug adapter used by this interface: the states
            before and after each line, per call stack, and the lines reached;
          </li>
          <li>the progress of the analysis as JSON lines, for the progress bar.</li>
        </Ul>
        <P>
          <A href={LINKS.forkCommits}>Its commits</A> list the changes.
        </P>
      </Section>

      <Section title="Source code" initiallyOpen>
        <Ul>
          <li>
            This interface and its build: <A href={LINKS.interface}>mopsa-emcc</A>{" "}
            (MIT)
          </li>
          <li>
            The Mopsa fork: <A href={LINKS.fork}>mopsa-analyzer-32-bit</A>
          </li>
          <li>
            Upstream Mopsa: <A href={LINKS.upstream}>mopsa-analyzer</A>
          </li>
          <li>
            The OCaml to WebAssembly compiler: <A href={LINKS.ocamlEmcc}>ocaml-emcc</A>
          </li>
          <li>
            <A href={LINKS.tryMopsa}>Try-Mopsa</A>, another in-browser Mopsa
            (Universal and Python), by Aymane Ismail and Raphaël Monat
          </li>
        </Ul>
      </Section>

      <Section title="Universal grammar">
        <P>
          Lowercase words are nonterminals, uppercase ones the identifiers
          (ID) and literals (INT 42, REAL 4.2, STRING "ab", CHAR 'a'). Comments
          are written // … or /* … */.
        </P>
        <Pre>{GRAMMAR}</Pre>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {GRAMMAR_NOTES.map(([code, text]) => (
            <div key={code} style={{ fontSize: 12, lineHeight: 1.45 }}>
              <code
                style={{
                  fontFamily: MONO,
                  fontVariantLigatures: "none",
                  color: "var(--text-primary)",
                }}
              >
                {code}
              </code>
              <span style={{ color: "var(--text-secondary)" }}> {text}</span>
            </div>
          ))}
        </div>
        <P>Example:</P>
        <Pre>{GRAMMAR_EXAMPLE}</Pre>
      </Section>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 16px 6px",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  initiallyOpen = false,
  children,
}: {
  title: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        <ChevronDownIcon
          size={12}
          style={{
            color: "var(--text-muted)",
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform 120ms",
          }}
        />
        {title}
      </button>
      {open && children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        listStyle: "disc",
        fontSize: 12,
        lineHeight: 1.55,
        color: "var(--text-secondary)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {children}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{label} </span>
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: "8px 10px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontFamily: MONO,
        fontVariantLigatures: "none",
        fontSize: 11,
        lineHeight: 1.5,
        color: "var(--text-primary)",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--color-accent)",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "baseline",
        gap: 2,
      }}
    >
      {children}
      <ExternalLinkIcon size={9} style={{ alignSelf: "center" }} />
    </a>
  );
}
