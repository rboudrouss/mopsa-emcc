export function parseCommandLineOptions(optionsString: string | undefined) {
  if (!optionsString) return [];
  const regex = /(?:[^\s"]+|"[^"]*")+/g;
  const matches = optionsString?.match(regex);
  return matches ? matches.map((option) => option.replace(/"/g, "")) : [];
}

// FIXME Universal must be the first since all the default configs are hardcoded for universal
export const supportedLanguages = ["universal", "c", "python"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export function handleCustomLanguage(
  lang: SupportedLanguage,
): SupportedLanguage {
  if (lang === "universal") return "c";
  return lang;
}

export function getFileExtensionFromLangage(lang: SupportedLanguage): string {
  switch (lang) {
    case "c":
      return "c";
    case "python":
      return "py";
    case "universal":
      return "u";
    default:
      return "";
  }
}

export function getLanguageFromFileExtension(ext: string): SupportedLanguage {
  switch (ext) {
    case "c":
      return "c";
    case "py":
      return "python";
    case "u":
      return "universal";
    default:
      return "universal";
  }
}

export function changeFileExtension(
  filename: string,
  lang: SupportedLanguage,
): string {
  const ext = getFileExtensionFromLangage(lang);
  return filename.includes(".")
    ? filename.replace(/\.[^/.]+$/, `.${ext}`)
    : `${filename}.${ext}`;
}

export function filesToFileItemList(files: string[]): FileItem[] {
  return files.map((file) => {
    return {
      id: file,
      name: file.replace(/.*\//, ""),
      type: "file",
      children: [],
    };
  });
}

export type FileItem = {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileItem[];
};
