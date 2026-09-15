/** Authenticated SSE invalidations. Payloads never replace protected order data. */
export async function readOrderEvents(url: string, token: string, signal: AbortSignal, onUpdate: () => void): Promise<void> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('Order stream unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 65536) throw new Error('Invalid order stream');
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const frame = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)![0];
        buffer = buffer.slice(boundary + separator.length);
        if (/^event:\s*(update|connected)\s*$/m.test(frame)) onUpdate();
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
