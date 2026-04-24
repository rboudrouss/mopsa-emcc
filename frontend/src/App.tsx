import { useEffect } from 'react';
import { ActivityBar } from '@/components/ActivityBar';
import { CenterPane } from '@/components/CenterPane';
import { RightPanel } from '@/components/RightPanel';
import { SecondarySidebar } from '@/components/SecondarySidebar';
import { TopBar } from '@/components/TopBar';
import { useAnalysis } from '@/lib/hooks/use-analysis';
import { useDebouncedFn } from '@/lib/hooks/use-debounced-fn';
import { useTheme } from '@/lib/hooks/use-theme';
import { usePresets } from '@/lib/hooks/use-presets';
import { useAppStore } from '@/lib/store';

export default function App() {
  const { resolved, toggle } = useTheme();
  const { data: presets, isSuccess } = usePresets();
  const { run: runAnalysis, isAnalyzing } = useAnalysis();

  const code = useAppStore((s) => s.code);
  const configText = useAppStore((s) => s.configText);
  const optionValues = useAppStore((s) => s.optionValues);
  const applyPreset = useAppStore((s) => s.applyPreset);

  // Initialise config from presets once they load
  useEffect(() => {
    if (!isSuccess || !presets) return;
    const firstConfig = Object.values(presets.configs.c ?? {})[0] ?? mopsaJs.configUni;
    if (!useAppStore.getState().configText) {
      mopsaJs.setConfig(firstConfig);
      applyPreset('default.json', firstConfig);
    }
  }, [isSuccess, presets, applyPreset]);

  const debouncedRun = useDebouncedFn(runAnalysis, 300);

  // Auto-run whenever code, config, or options change
  useEffect(() => {
    debouncedRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, configText, JSON.stringify(optionValues)]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '44px auto 1fr 340px',
        gridTemplateRows: '48px 1fr',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      <TopBar
        isAnalyzing={isAnalyzing}
        onRunClick={runAnalysis}
        resolvedTheme={resolved}
        onThemeToggle={toggle}
        presets={presets}
      />
      <ActivityBar />
      <SecondarySidebar />
      <CenterPane resolvedTheme={resolved} />
      <RightPanel />
    </div>
  );
}
