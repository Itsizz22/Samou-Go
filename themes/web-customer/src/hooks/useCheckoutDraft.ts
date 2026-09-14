import { useCallback, useEffect, useState } from 'react';
export function useCheckoutDraft(key: string) {
  const read = () => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
  const [state, setState] = useState(() => ({ key, value: read() }));
  const value = state.key === key ? state.value : read();
  useEffect(() => {
    if (state.key !== key) return;
    try {
      localStorage.setItem(key, state.value);
    } catch {
      /* Draft remains in memory. */
    }
  }, [key, state]);
  const update = useCallback((value: string) => setState({ key, value }), [key]);
  return [value, update] as const;
}
