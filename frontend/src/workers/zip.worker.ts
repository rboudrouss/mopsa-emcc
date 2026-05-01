/// <reference lib="webworker" />
export type {};

import JSZip from "jszip";

self.onmessage = async (
  e: MessageEvent<{ files: { path: string; content: string }[] }>,
) => {
  const { files } = e.data;
  const zip = new JSZip();
  for (const { path, content } of files) {
    zip.file(path, content);
  }
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  self.postMessage({ buffer }, [buffer]);
};
