import { Editor } from "@monaco-editor/react";
import MopsaJs from "../lib/mopsaJs";
import { handleCustomLanguage, SupportedLanguage } from "../lib";

export default function CodeEditor({
  language = "universal",
  selectedFile = null,
}: {
  language?: SupportedLanguage;
  selectedFile: string | null;
}) {
  const defaultValue = selectedFile
    ? MopsaJs.readFile(selectedFile)
    : MopsaJs.getCode();

  return (
    <Editor
      key={selectedFile ?? "default"}
      height="100%"
      width="100%"
      language={handleCustomLanguage(language)}
      defaultValue={defaultValue}
      onChange={(value) => {
        if (selectedFile) MopsaJs.writeFile(selectedFile, value ?? "");
        MopsaJs.setCode(value ?? "");
      }}
    />
  );
}
