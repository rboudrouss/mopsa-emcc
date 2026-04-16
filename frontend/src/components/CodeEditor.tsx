import { Editor } from "@monaco-editor/react";
import MopsaJs from "../lib/mopsaJs";
import { handleCustomLanguage, SupportedLanguage } from "../lib";
import { useEffect, useState } from "react";

export default function CodeEditor({
  language = "universal",
  selectedFile = null,
}: {
  language?: SupportedLanguage;
  selectedFile: string | null;
}) {
  let [file, setFile] = useState<string | null>(selectedFile);
  let [content, setContent] = useState<string>(getContent());

  useEffect(() => {
    console.log("Selected file changed", selectedFile);

    setFile(selectedFile);
    setContent(getContent());
  }, [selectedFile]);

  function writeFile(content: string) {
    if (file) {
      MopsaJs.writeFile(file, content);
    }
    MopsaJs.setCode(content);
  }

  function getContent() {
    if (file) {
      return MopsaJs.readFile(file);
    }
    return MopsaJs.getCode();
  }

  return (
    <Editor
      height="100%"
      width="100%"
      language={handleCustomLanguage(language)}
      defaultValue={getContent()}
      value={content}
      onChange={(value, _) => {
        writeFile(value ?? "");
      }}
    />
  );
}
