import { useCallback, useEffect, useState } from "react";

type ThemeMode = "auto" | "light" | "dark";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem("mopsa-theme") as ThemeMode | null) ?? "auto",
  );

  const resolved: "light" | "dark" = mode === "auto" ? getSystemTheme() : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.classList.toggle("light", mode === "light");
    if (mode !== "auto") {
      localStorage.setItem("mopsa-theme", mode);
    } else {
      localStorage.removeItem("mopsa-theme");
    }
  }, [mode]);

  // Re-render when OS preference changes while mode is 'auto'
  useEffect(() => {
    if (mode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setMode("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  return { mode, resolved, toggle };
}
