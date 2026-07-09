import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
  );
}

/**
 * Mobile layout breakpoint: below 768px the app renders the single-column
 * tabbed layout (bottom dock + sheets); tablets and up keep the desktop
 * resizable-panels layout.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
