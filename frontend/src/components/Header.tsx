import { SupportedLanguage, supportedLanguages } from "../lib";
import MopsaJs from "../lib/mopsaJs";

export default function Header({
  onLanguageChange,
  onRunClick,
  onShowConfigClick,
  showConfig,
  optionsRef,
}: {
  onLanguageChange: (language: SupportedLanguage) => void;
  onRunClick: () => void;
  onShowConfigClick: (bool?: boolean) => void;
  optionsRef: React.RefObject<HTMLInputElement | null>;
  showConfig: boolean;
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem",
        borderBottom: "1px solid #ccc",
        height: "4rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <h1>Mopsa</h1>
        <button onClick={onRunClick}>Run</button>
        <select
          name="language"
          id="language"
          onChange={(e) => {
            let value = e.target.value as SupportedLanguage;
            onShowConfigClick(false);
            MopsaJs.setConfig(MopsaJs.defaultConfigs[value]);
            onLanguageChange(value);
          }}
        >
          {supportedLanguages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button onClick={() => onShowConfigClick()}>
          {showConfig ? "Show Mopsa Output" : "Show Config"}
        </button>
        <input type="text" ref={optionsRef} placeholder="Options" />
      </div>
    </header>
  );
}
