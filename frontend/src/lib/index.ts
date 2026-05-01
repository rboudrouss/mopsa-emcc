// Matches a Mopsa-reported file path against the currently open file path.
// Handles both absolute (/c-multifile/main.c) and relative (main.c) forms.
export function inFile(file: string, codeFilePath: string): boolean {
  const norm = file.startsWith("/") ? file : "/" + file;
  return codeFilePath === norm || codeFilePath.endsWith("/" + file);
}

type SupportedLanguage = "universal" | "c" | "python";

export function getLanguageFromFileExtension(ext: string): SupportedLanguage {
  switch (ext) {
    case "c":
    case "h":
      return "c";
    case "py":
      return "python";
    case "u":
      return "universal";
    default:
      return "universal";
  }
}
