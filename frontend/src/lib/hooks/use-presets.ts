import { useQuery } from '@tanstack/react-query';

export function usePresets() {
  return useQuery<shareData>({
    queryKey: ['mopsa-presets'],
    queryFn: async () => {
      // Try the dev server path first, then production fallback
      const paths = ['./src/lib/share.json', './share.json'];
      for (const path of paths) {
        const res = await fetch(path);
        if (res.ok) return res.json() as Promise<shareData>;
      }
      throw new Error('Could not load share.json');
    },
    staleTime: Infinity,
  });
}
