let unreachable = false;
const listeners = new Set<() => void>();
export const connectionSnapshot = () => unreachable;
export const subscribeConnection = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setServerUnreachable(value: boolean): void {
  if (value === unreachable) return;
  unreachable = value;
  for (const listener of listeners) listener();
}
