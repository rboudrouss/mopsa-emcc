import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

loader.config({ monaco });

monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  allowComments: true,
});

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
