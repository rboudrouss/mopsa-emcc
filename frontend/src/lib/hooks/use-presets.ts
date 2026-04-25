import { useQuery } from "@tanstack/react-query";

export function usePresets() {
  return useQuery<shareData>({
    queryKey: ["mopsa-presets"],
    queryFn: () =>
      fetch("/share.json").then((res) => {
        if (!res.ok) throw new Error("Failed to load presets");
        return res.json();
      }),
    staleTime: Infinity,
  });
}
