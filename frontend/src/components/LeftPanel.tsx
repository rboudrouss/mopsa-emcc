import { filesToFileItemList, SupportedLanguage } from "@/lib";
import CodeEditor from "./CodeEditor";
import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./resizable";
import { FileExplorer } from "./file-explorer";
import MopsaJs from "@/lib/mopsaJs";

export default function LeftPanel({
  language,
}: {
  language: SupportedLanguage;
}) {
  let [showFileExplorer, setShowFileExplorer] = useState(false);
  let [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <ResizablePanelGroup direction="horizontal">
      {showFileExplorer && (
        <ResizablePanel defaultSize={20} order={0} id="file-explorer">
          <FileExplorer
            initialData={filesToFileItemList(MopsaJs.listDir("/"))}
            onSelectedFile={setSelectedFile}
            createFile={(fileName: string) => {
              MopsaJs.writeFile(fileName, "");
            }}
            deleteFile={(fileName: string) => {
              MopsaJs.deleteFile(fileName);
            }}
            moveFile={(oldName: string, newName: string) => {
              MopsaJs.moveFile(oldName, newName);
            }}
          />
        </ResizablePanel>
      )}
      {showFileExplorer && <ResizableHandle />}
      <ResizablePanel
        defaultSize={showFileExplorer ? 80 : 100}
        order={1}
        id="code-editor"
      >
        <CodeEditor language={language} selectedFile={selectedFile} />
        {/* <button
          style={{
            position: "fixed",
            left: "1rem",
            bottom: "1rem",
            zIndex: 10,
            borderWidth: "1px",
            borderColor: "black",
          }}
          onClick={() => setShowFileExplorer((prev) => !prev)}
        >
          {showFileExplorer ? "Hide File Explorer" : "Show File Explorer"}
        </button> */}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
