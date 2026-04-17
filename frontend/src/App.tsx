import { useRef, useState } from "react";
import { changeFileExtension, parseCommandLineOptions, SupportedLanguage } from "./lib";
import Header from "./components/Header";
import MopsaJs from "./lib/mopsaJs";
import RightPanel from "./components/RightPanel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/resizable";
import LeftPanel from "./components/LeftPanel";

function App() {
  const [lang, setLang] = useState<SupportedLanguage>("c");
  const [output, setOutput] = useState<string>("");
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const optionsRef = useRef<HTMLInputElement | null>(null);

  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
      <Header
        onLanguageChange={(language) => {
          let codeFilePath = MopsaJs.getCodeFilePath();
          let destination = changeFileExtension(codeFilePath, language);
          MopsaJs.moveFile(
            codeFilePath,
            changeFileExtension(codeFilePath, language)
          )
          MopsaJs.changeCodeFilePath(destination);

          setLang(language);
          setOutput(
            "Please note that changing the language resets the config."
          );
        }}
        onRunClick={async () => {
          if (!MopsaJs.getConfig()) MopsaJs.setConfig(mopsaJs.configUni);
          const options = parseCommandLineOptions(optionsRef.current?.value);

          setShowConfig(false);
          setOutput("Running…");
          setOutput(await MopsaJs.analyze(options));
        }}
        onShowConfigClick={(b) => {
          if (typeof b === "boolean") setShowConfig(b);
          else setShowConfig(!showConfig);
        }}
        showConfig={showConfig}
        optionsRef={optionsRef}
      />
      <ResizablePanelGroup
        style={{ flex: 1, minHeight: 0 }}
        direction={
          window.matchMedia("(max-width: 768px)").matches
            ? "vertical"
            : "horizontal"
        }
      >
        <ResizablePanel defaultSize={50}>
          <LeftPanel language={lang} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>
          <RightPanel
            output={output}
            showConfig={showConfig}
            setLang={setLang}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
