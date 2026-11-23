import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { DomainNode } from "@/components/ui/DomainNode";
import { parseConfigText } from "@/lib/mopsa-client";
import { isFlagLockedByBackend } from "@/lib/backend";
import { OPTIONS_SCHEMA } from "@/lib/options-schema";
import { SELECT_STYLE } from "@/components/ui/select-style";
import { Switch } from "@/components/ui/Switch";
import {
  choicePreset,
  intervalsOptional,
  MEMORY_DOMAINS,
  presetText,
  readChoice,
  relationOptions,
  valueOptions,
  type DomainChoice,
  type DomainKind,
} from "@/lib/domain-builder";
import { useEditorNav, type InlineDomain } from "@/lib/editor-nav";
import { usePresets } from "@/lib/hooks/use-presets";
import { getActiveAnalysisMode, getNodePath } from "@/lib/tree";
import { useAppStore } from "@/lib/store";
import type { SupportedLanguage } from "@/lib/types";

const SUPPORTED_EXTENSIONS: Record<string, SupportedLanguage> = {
  c: "c",
  h: "c",
  py: "python",
  u: "universal",
};

const TITLE: Record<DomainKind, string> = {
  c: "C Domains",
  python: "Python Domains",
  universal: "Universal Domains",
  multilanguage: "Multilanguage Domains",
};

// The relational domains, as the Options panel lists them.
const NUMERIC = OPTIONS_SCHEMA.flatMap((g) => g.options).find(
  (o) => o.flag === "-numeric",
);

// Modules the options cannot show: a config with one of them was written by
// hand or comes from another preset.
const OTHER_MODULES = [
  "universal.partitioning.int-var",
  "universal.numeric.collecting",
  "universal.numeric.relational_heterogeneous",
  "python.types.dummy_numeric",
];

export function DomainsPanel() {
  const configText = useAppStore((s) => s.configText);
  const configDirty = useAppStore((s) => s.configDirty);
  const lang = useAppStore((s) => s.lang);
  const customConfigs = useAppStore((s) => s.customConfigs);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const applyCustom = useAppStore((s) => s.applyCustom);
  const setLang = useAppStore((s) => s.setLang);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const numeric = useAppStore((s) => s.optionValues["-numeric"]);
  const setOptionValue = useAppStore((s) => s.setOptionValue);
  const setInlineShown = useEditorNav((s) => s.setInlineShown);
  const [treeOpen, setTreeOpen] = useState(false);

  const isMultilang =
    getActiveAnalysisMode({ fileTree, activeFile, lang }) === "multilanguage";
  const configKey = isMultilang ? "multilanguage" : lang;
  const hasCustom = !!customConfigs[configKey];

  const { data: presets } = usePresets();

  // The language of the active file: none for unsupported extensions.
  const activeFilePath = activeFile ? getNodePath(fileTree, activeFile) : null;
  const activeExt = activeFilePath
    ? (activeFilePath.split(".").pop() ?? "")
    : "";
  const activeLang: SupportedLanguage | null =
    SUPPORTED_EXTENSIONS[activeExt] ?? null;

  const parsed = parseConfigText(configText) as Record<string, unknown> | null;
  const domain = parsed?.domain;

  const kind: DomainKind = isMultilang ? "multilanguage" : (activeLang ?? lang);
  const presetLang: SupportedLanguage = isMultilang
    ? "python"
    : (activeLang ?? lang);
  const choice = readChoice(parsed);
  const handWritten =
    configDirty || OTHER_MODULES.some((m) => configText.includes(`"${m}"`));

  const apply = (next: DomainChoice) => {
    if (!presets) return;
    const name = choicePreset(kind, next);
    const text = presetText(presets.configs, presetLang, name);
    if (!text) return;
    if (presetLang !== lang && !isMultilang) setLang(presetLang, text);
    applyPreset(name, text);
    // A domain turned on shows inline
    if (next.intervals && !choice.intervals) setInlineShown("intervals", true);
    if (next.floats && !choice.floats) setInlineShown("floats", true);
    for (const d of next.values)
      if (!choice.values.includes(d)) setInlineShown(d, true);
    if (choice.relations === "none" && next.relations !== "none")
      setInlineShown("relations", true);
  };
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 6px",
        }}
      >
        <span style={HEADING}>
          {!isMultilang && activeLang === null ? "Domains" : TITLE[kind]}
        </span>
        <button
          onClick={() => setActiveTab("config")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--color-accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: 3,
          }}
        >
          <ExternalLinkIcon size={11} />
          Edit config
        </button>
      </div>

      {!isMultilang && activeLang === null ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontStyle: "italic",
            padding: "4px 18px 10px",
            lineHeight: 1.4,
          }}
        >
          Select a file with a supported extension (.c, .h, .py, .u) to
          configure domains.
        </div>
      ) : (
        <div style={{ padding: "0 16px 8px" }}>
          {handWritten && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.4,
                margin: "2px 0 6px",
              }}
            >
              config.json was edited by hand. An option changed here replaces
              it.
            </div>
          )}

          <Section title="Values">
            {intervalsOptional(kind) ? (
              <Toggle
                label="Integer intervals"
                title={
                  choice.values.length === 0
                    ? "Bounds of the integers. Turn another value domain on to analyze without them"
                    : "Bounds of the integers"
                }
                eye={<Eye domain="intervals" label="Integer intervals" on />}
                checked={choice.intervals}
                disabled={choice.intervals && choice.values.length === 0}
                onChange={() =>
                  apply({ ...choice, intervals: !choice.intervals })
                }
              />
            ) : (
              <Toggle
                label="Integer intervals"
                checked
                disabled
                title="Always on"
                eye={<Eye domain="intervals" label="Integer intervals" on />}
              />
            )}
            <Toggle
              label="Float intervals"
              title={
                kind === "c" || kind === "multilanguage"
                  ? "Bounds of the floats. Off, the analysis stops at the first float"
                  : "Bounds of the floats. Off, the floats need the relations"
              }
              eye={
                <Eye domain="floats" label="Float intervals" on={choice.floats} />
              }
              checked={choice.floats}
              onChange={() => apply({ ...choice, floats: !choice.floats })}
            />
            {valueOptions(kind).map((d) => (
              <Toggle
                key={d.id}
                label={d.label}
                title={d.title}
                eye={
                  <Eye
                    domain={d.id}
                    label={d.label}
                    on={choice.values.includes(d.id)}
                  />
                }
                checked={choice.values.includes(d.id)}
                onChange={() => {
                  const values = toggle(choice.values, d.id);
                  // no value domain left: the intervals come back
                  apply({
                    ...choice,
                    values,
                    intervals: choice.intervals || values.length === 0,
                  });
                }}
              />
            ))}
          </Section>

          <Section
            title="Relations"
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Eye
                  domain="relations"
                  label="Relations"
                  on={choice.relations !== "none"}
                />
                {!isFlagLockedByBackend("-numeric") && (
                  <select
                    aria-label="Relational domain"
                    title="The relational domain of the options below"
                    value={String(numeric ?? NUMERIC?.default)}
                    onChange={(e) => setOptionValue("-numeric", e.target.value)}
                    style={SELECT_STYLE}
                  >
                    {NUMERIC?.choices?.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            }
          >
            <Steps
              label="Relations"
              items={relationOptions(kind)}
              value={choice.relations}
              onPick={(relations) => apply({ ...choice, relations })}
            />
          </Section>

          {(kind === "c" || kind === "multilanguage") && (
            <Section title="Memory">
              <Toggle
                label="Pointers"
                checked
                disabled
                title="Always on"
                eye={<Eye domain="pointers" label="Pointers" on />}
              />
              {kind === "c" && MEMORY_DOMAINS.map((d) => {
                const needsStrings =
                  d.id === "sentinels" && !choice.memory.includes("strings");
                return (
                  <Toggle
                    key={d.id}
                    label={d.label}
                    title={d.title}
                    disabled={needsStrings}
                    checked={choice.memory.includes(d.id)}
                    onChange={() => {
                      let memory = toggle(choice.memory, d.id);
                      if (!memory.includes("strings"))
                        memory = memory.filter((m) => m !== "sentinels");
                      apply({ ...choice, memory });
                    }}
                  />
                );
              })}
            </Section>
          )}

          <Section title="Partitioning">
            <Toggle
              label="Keep branches apart"
              title="The states of the last if/else stay separate instead of being joined"
              checked={choice.branches}
              onChange={() => apply({ ...choice, branches: !choice.branches })}
            />
          </Section>

          {!configDirty && hasCustom && (
            <button
              onClick={() => applyCustom(configKey)}
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "var(--color-accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Restore the edited config.json
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setTreeOpen((o) => !o)}
        style={{
          ...HEADING,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 14px 6px",
          background: "none",
          border: "none",
          borderTop: "1px solid var(--border)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {treeOpen ? (
          <ChevronDownIcon size={12} />
        ) : (
          <ChevronRightIcon size={12} />
        )}
        Modules
      </button>
      {treeOpen && (
        <div style={{ overflowY: "auto", flex: 1 }}>
          {domain ? (
            <DomainNode node={domain} depth={0} />
          ) : (
            <div
              style={{
                padding: "8px 16px",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {configText ? "Could not parse config" : "No config loaded"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const HEADING: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `domains-${title.toLowerCase()}`;
  return (
    <div
      role="group"
      aria-labelledby={id}
      style={{
        margin: "8px 0 0",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 18,
          paddingBottom: 3,
        }}
      >
        <span id={id} style={{ ...HEADING, fontSize: 10 }}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Options ordered from the cheapest to the most precise, as stops on a
 * track: the track fills up to the one picked.
 */
function Steps<T extends string>({
  label,
  items,
  value,
  onPick,
}: {
  label: string;
  items: { id: T; label: string; title: string; hint?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  const index = Math.max(
    0,
    items.findIndex((it) => it.id === value),
  );
  const last = items.length - 1;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next =
      e.key === "ArrowRight"
        ? index + 1
        : e.key === "ArrowLeft"
          ? index - 1
          : -1;
    if (next < 0 || next > last) return;
    e.preventDefault();
    onPick(items[next].id);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ position: "relative", padding: "4px 0 2px" }}
    >
      {/* the track, between the centers of the first and last dots */}
      <div
        style={{
          position: "absolute",
          top: 4 + DOT / 2 - 1,
          left: DOT / 2,
          right: DOT / 2,
          height: 2,
          borderRadius: 1,
          background: "var(--border)",
        }}
      >
        <div
          style={{
            width: `${last ? (100 * index) / last : 0}%`,
            height: "100%",
            borderRadius: 1,
            background: "var(--color-accent)",
            transition: "width 150ms",
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {items.map((it, i) => {
          const active = i === index;
          return (
            <button
              key={it.id}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={it.title}
              onClick={() => onPick(it.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems:
                  i === 0 ? "flex-start" : i === last ? "flex-end" : "center",
                gap: 4,
                padding: 0,
                background: "none",
                border: "none",
                cursor: active ? "default" : "pointer",
              }}
            >
              <span
                style={{
                  width: DOT,
                  height: DOT,
                  boxSizing: "border-box",
                  borderRadius: "50%",
                  border: `2px solid ${i <= index ? "var(--color-accent)" : "var(--border)"}`,
                  background: active
                    ? "var(--color-accent)"
                    : "var(--bg-surface)",
                  transition: "background 150ms, border-color 150ms",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {it.label}
              </span>
              {it.hint && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    marginTop: -3,
                  }}
                >
                  {it.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DOT = 12;

function Toggle({
  label,
  title,
  checked,
  disabled,
  eye,
  onChange,
}: {
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  /** Its eye, before the switch. */
  eye?: React.ReactNode;
  onChange?: () => void;
}) {
  return (
    <div
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 0",
      }}
    >
      <span
        onClick={disabled ? undefined : onChange}
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-primary)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {label}
      </span>
      {eye}
      <span style={{ display: "flex", opacity: disabled ? 0.5 : 1 }}>
        <Switch
          label={label}
          checked={checked}
          disabled={disabled}
          onChange={() => onChange?.()}
        />
      </span>
    </div>
  );
}

/**
 * Whether the inline values of the editor show a domain: an open eye or a
 * closed one, greyed when the domain is off (`on` false) or the inline
 * values are.
 */
function Eye({
  domain,
  label,
  on,
}: {
  domain: InlineDomain;
  label: string;
  on: boolean;
}) {
  const shown = useEditorNav((s) => !s.inlineHidden.includes(domain));
  const inlineOff = useEditorNav((s) => s.inlineValues === "off");
  const setInlineShown = useEditorNav((s) => s.setInlineShown);
  const disabled = !on || inlineOff;
  const title = !on
    ? `${label}: off, so not inline`
    : inlineOff
      ? "The inline values are off (Inline, above the editor)"
      : shown
        ? `${label} shown in the inline values: click to hide`
        : `${label} hidden from the inline values: click to show`;
  return (
    <button
      aria-label={`${label} inline`}
      aria-pressed={shown}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        setInlineShown(domain, !shown);
      }}
      style={{
        display: "flex",
        padding: 2,
        background: "none",
        border: "none",
        borderRadius: 3,
        cursor: disabled ? "default" : "pointer",
        color: shown && !disabled ? "var(--color-accent)" : "var(--text-muted)",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {shown ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
    </button>
  );
}
