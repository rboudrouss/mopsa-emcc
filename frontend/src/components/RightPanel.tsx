import { SupportedLanguage } from "../lib";
import ConfigEditor from "./ConfigEditor";
import MopsaOutput from "./MopsaOutput";

export default function RightPanel({
  output,
  showConfig,
  setLang,
}: {
  output: string;
  showConfig: boolean;
  setLang: (lang: SupportedLanguage) => void;
}) {
  if (showConfig) return <ConfigEditor setLang={setLang}/>;
  return <MopsaOutput output={output} />;
}
