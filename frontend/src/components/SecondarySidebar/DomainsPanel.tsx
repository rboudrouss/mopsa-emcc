import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { DomainNode } from "@/components/ui/DomainNode";
import { parseConfigText } from "@/lib/mopsa-client";
import { isFlagLockedByBackend } from "@/lib/backend";
import {
  choicePreset,
  MEMORY_DOMAINS,
  presetText,
  readChoice,
  relationOptions,
  valueOptions,
  type DomainChoice,
  type DomainKind,
} from "@/lib/domain-builder";
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

const ALGORITHMS: [string, string][] = [
  ["polyhedra", "Polyhedra"],
  ["octagon", "Octagons"],
  ["lineq", "Linear equalities"],
];

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
            <Check label="Intervals" checked disabled title="Always on" />
            {valueOptions(kind).map((d) => (
              <Check
                key={d.id}
                label={d.label}
                title={d.title}
                checked={choice.values.includes(d.id)}
                onChange={() =>
                  apply({ ...choice, values: toggle(choice.values, d.id) })
                }
              />
            ))}
          </Section>

          <Section title="Relations">
            {relationOptions(kind).map((r) => (
              <Radio
                key={r.id}
                name={`relations-${kind}`}
                label={r.label}
                title={r.title}
                checked={choice.relations === r.id}
                onChange={() => apply({ ...choice, relations: r.id })}
              />
            ))}
            {choice.relations !== "none" &&
              !isFlagLockedByBackend("-numeric") && (
                <select
                  aria-label="Relational domain"
                  value={String(numeric ?? "polyhedra")}
                  onChange={(e) => setOptionValue("-numeric", e.target.value)}
                  style={{
                    alignSelf: "flex-start",
                    margin: "2px 0 0 22px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    color: "var(--text-primary)",
                    fontSize: 11,
                    padding: "1px 4px",
                  }}
                >
                  {ALGORITHMS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
          </Section>

          {kind === "c" && (
            <Section title="Memory">
              {MEMORY_DOMAINS.map((d) => {
                const needsStrings =
                  d.id === "sentinels" && !choice.memory.includes("strings");
                return (
                  <Check
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
            <Check
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      style={{
        border: "none",
        margin: "8px 0 0",
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <legend style={{ ...HEADING, fontSize: 10, padding: "0 0 3px" }}>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

interface ChoiceProps {
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}

function Check(props: ChoiceProps) {
  return <ChoiceRow type="checkbox" {...props} />;
}

function Radio(props: ChoiceProps & { name: string }) {
  return <ChoiceRow type="radio" {...props} />;
}

function ChoiceRow({
  type,
  name,
  label,
  title,
  checked,
  disabled,
  onChange,
}: ChoiceProps & { type: "checkbox" | "radio"; name?: string }) {
  return (
    <label
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "2px 0",
        fontSize: 12,
        color: disabled ? "var(--text-muted)" : "var(--text-primary)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange ?? (() => {})}
        style={{ margin: 0, accentColor: "var(--color-accent)" }}
      />
      {label}
    </label>
  );
}
