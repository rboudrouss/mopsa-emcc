import { useCallback, useRef } from 'react';

export function useDebouncedFn<T extends () => void>(fn: T, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(), delay);
  }, [delay]);
}
