/** Poll only while visible; refresh immediately after returning to the page. */
export function startForegroundPolling(reload: () => void, pollMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const start = () => { stop(); if (!document.hidden) timer = setInterval(reload, pollMs); };
  const onVisibility = () => { start(); if (!document.hidden) reload(); };
  start();
  document.addEventListener('visibilitychange', onVisibility);
  return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
}
