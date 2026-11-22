/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** The Mopsa commit and patches of the backends (mopsa-build.json) */
declare const __MOPSA_BUILD__: {
  repository: string;
  branch: string;
  commit: string | null;
  date: string | null;
  patches: { file: string; title: string }[];
} | null;
