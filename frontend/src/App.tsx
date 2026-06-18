import { useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ActivityBar } from "@/components/ActivityBar";
import { CenterPane } from "@/components/CenterPane";
import { RightPanel } from "@/components/RightPanel";
import { SecondarySidebar } from "@/components/SecondarySidebar";
import { TopBar } from "@/components/TopBar";
import { useRun } from "@/lib/hooks/use-run";
import { useDebouncedFn } from "@/lib/hooks/use-debounced-fn";
import { useTheme } from "@/lib/hooks/use-theme";
import { usePresets } from "@/lib/hooks/use-presets";
import { useAppStore } from "@/lib/store";
import { computeRunSignature } from "@/lib/analysis-args";

export default function App() {
  const { resolved, toggle } = useTheme();
  const { data: presets, isSuccess } = usePresets();
  const { run: runAnalysis, isAnalyzing } = useRun();
  const activePanel = useAppStore((s) => s.activePanel);

  const code = useAppStore((s) => s.code);
  const configText = useAppStore((s) => s.configText);
  const optionValues = useAppStore((s) => s.optionValues);
  const activeFile = useAppStore((s) => s.activeFile);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const setPresets = useAppStore((s) => s.setPresets);
  const autoRun = useAppStore((s) => s.autoRun);
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as string) ?? "automatic",
  );
  const requestSessionStart = useAppStore((s) => s.requestSessionStart);

  // Initialise config from presets once they load
  useEffect(() => {
    if (!isSuccess || !presets) return;
    setPresets(presets);
    const state = useAppStore.getState();
    if (!state.configText) {
      const langKey = state.lang as keyof typeof presets.configs;
      const langConfigs = presets.configs[langKey] ?? presets.configs.c;
      const firstConfig = langConfigs["default.json"] ?? mopsaJs.configUni;
      mopsaJs.setConfig(firstConfig);
      applyPreset("default.json", firstConfig);
    }
  }, [isSuccess, presets, applyPreset, setPresets]);

  const debouncedRun = useDebouncedFn(runAnalysis, 500);

  const prevRunSig = useRef<string | null>(null);
  const prevActiveFile = useRef<string | null>(activeFile);

  // Auto-run on code/config/option changes (batch engine only). A bare file
  // switch re-runs only if the run signature changed; switching within a
  // C/C+Py workspace, or Python with a fixed entry point, leaves it identical.
  useEffect(() => {
    const engine = (optionValues["-engine"] as string) ?? "automatic";
    if (!autoRun || engine !== "automatic") {
      // Keep the baseline fresh so re-enabling doesn't misfire on a past switch.
      prevActiveFile.current = activeFile;
      prevRunSig.current = computeRunSignature();
      return;
    }

    const sig = computeRunSignature();
    const fileSwitched = activeFile !== prevActiveFile.current;
    const shouldRun = !fileSwitched || sig !== prevRunSig.current;

    prevActiveFile.current = activeFile;
    prevRunSig.current = sig;

    if (shouldRun) debouncedRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, code, configText, JSON.stringify(optionValues), activeFile]);

  const prevEngine = useRef(engine);
  const prevSessionFile = useRef(activeFile);
  const prevSessionSig = useRef<string | null>(null);

  // Interactive engine: when auto-run is on, auto-(re)start the live REPL —
  // once on switching into interactive mode, then again on a file switch (the
  // terminal kills the previous session before launching the new one). A bare
  // file switch only restarts when the run signature actually changes (a
  // different workspace); hopping between files in the same workspace leaves
  // the analysis identical, so the running session is left alone.
  // Disabling auto-run, or using DAP, leaves session control on the Run button.
  useEffect(() => {
    const wasInteractive = prevEngine.current === "interactive";
    const fileSwitched = activeFile !== prevSessionFile.current;
    const sig = computeRunSignature();
    const sigChanged = sig !== prevSessionSig.current;
    prevEngine.current = engine;
    prevSessionFile.current = activeFile;
    prevSessionSig.current = sig;

    if (!autoRun || engine !== "interactive") return;
    if (!wasInteractive || (fileSwitched && sigChanged)) requestSessionStart();
  }, [autoRun, engine, activeFile, requestSessionStart]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gridTemplateRows: "48px 1fr",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <TopBar
        isAnalyzing={isAnalyzing}
        onRunClick={runAnalysis}
        resolvedTheme={resolved}
        onThemeToggle={toggle}
      />
      <ActivityBar />
      <PanelGroup
        direction="horizontal"
        autoSaveId="mopsa-layout"
        style={{ gridColumn: 2, height: "100%", overflow: "hidden" }}
      >
        {activePanel && (
          <>
            <Panel
              defaultSize={20}
              minSize={12}
              maxSize={40}
              id="left"
              order={1}
              style={{ overflow: "hidden" }}
            >
              <SecondarySidebar />
            </Panel>
            <PanelResizeHandle style={resizeHandleStyle} />
          </>
        )}
        <Panel
          minSize={30}
          id="center"
          order={2}
          style={{ overflow: "hidden" }}
        >
          <CenterPane resolvedTheme={resolved} />
        </Panel>
        <PanelResizeHandle style={resizeHandleStyle} />
        <Panel
          defaultSize={25}
          minSize={15}
          maxSize={45}
          id="right"
          order={3}
          style={{ overflow: "hidden" }}
        >
          <RightPanel isAnalyzing={isAnalyzing} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

const resizeHandleStyle: React.CSSProperties = {
  width: 4,
  cursor: "col-resize",
  flexShrink: 0,
};
