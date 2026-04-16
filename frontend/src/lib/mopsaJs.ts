// Wrapper around the global `mopsaJs` object injected by the WASM module's
// post.js.  Keeping all direct accesses here means changing the underlying
// API only requires editing this file.
import share from "./share.json";

const defaultCode = `int main() { return 0; }\n`;

// Expose share data as a global so TypeScript consumers that reference
// the `shareData` global (declared in mopsaJs.d.ts) can access it.
(window as any).shareData = share;

const defaultConfigs = {
  c:         getShares()["configs"]["c"]["default.json"],
  python:    getShares()["configs"]["python"]["default.json"],
  cfg:       getShares()["configs"]["cfg"]["default.json"],
  universal: getShares()["configs"]["universal"]["default.json"],
};

function setCode(code: string) {
  mopsaJs.setCode(code + "\n");
}

function setConfig(config: string) {
  mopsaJs.setConfig(config);
}

function getCode() {
  try {
    return mopsaJs.getCode();
  } catch (e) {
    console.log(
      "[FRONTEND] mopsaJs.getCode() failed, falling back to default code."
    );
    mopsaJs.setCode(defaultCode);
    return defaultCode;
  }
}

function getConfig() {
  try {
    return mopsaJs.getConfig();
  } catch (e) {
    console.log(
      "[FRONTEND] mopsaJs.getConfig() failed, falling back to universal config."
    );
    mopsaJs.setConfig(defaultConfigs.universal);
    return defaultConfigs.universal;
  }
}

/** Async – returns the captured analysis output. */
async function analyze(options: string[]): Promise<string> {
  return mopsaJs.analyze(options);
}

/** Convenience: set code + config before running. */
async function analyzeParams(
  options: string[],
  code: string,
  config: string
): Promise<string> {
  setCode(code);
  setConfig(config);
  return analyze(options);
}

function getShares() {
  return share as shareData;
}

function moveFile(filename: string, destination: string) {
  const content = mopsaJs.readFile(filename);
  mopsaJs.writeFile(destination, content);
  mopsaJs.deleteFile(filename);
}

function listDir(dir: string) {
  // Ensure default files exist before listing (same as JSOO behaviour).
  MopsaJs.getCode();
  MopsaJs.getConfig();

  try {
    const out = mopsaJs.listDir(dir);
    return (out.slice(1) as string[]).filter(
      (s) => s !== "dev" && s !== "config.json"
    );
  } catch (e) {
    console.log("[FRONTEND] mopsaJs.listDir() failed, returning [].");
    return [];
  }
}

function getCodeFilePath() {
  return mopsaJs.getCodeFilePath()[1];
}

function changeCodeFilePath(codeFilePath: string) {
  if (!codeFilePath.startsWith("/")) codeFilePath = "/" + codeFilePath;
  mopsaJs.changeCodeFilePath(codeFilePath);
}

function writeFile(filename: string, content: string) {
  if (!filename.startsWith("/")) filename = "/" + filename;
  mopsaJs.writeFile(filename, content);
}

function readFile(filename: string) {
  if (!filename.startsWith("/")) filename = "/" + filename;
  return mopsaJs.readFile(filename);
}

function deleteFile(filename: string) {
  if (!filename.startsWith("/")) filename = "/" + filename;
  mopsaJs.deleteFile(filename);
}

const MopsaJs = {
  changeCodeFilePath,
  getCodeFilePath,
  moveFile,
  listDir,
  setConfig,
  analyze,
  setCode,
  analyzeParams,
  getCode,
  getConfig,
  getShares,
  writeFile,
  readFile,
  deleteFile,
  defaultConfigs,
};
export default MopsaJs;
