// Read-only probe suitable for an external uptime runner. Nonzero exit on failure.
const api = process.env.SAMOU_API_ORIGIN || 'https://samou-go.onrender.com';
const targets = [api + '/ready', ...['customer','store-manager','captain','admin','checkout','store-details','order-tracking'].map(app => 'https://samou-go-' + app + '.vercel.app')];
const results = await Promise.all(targets.map(async url => {
  const started = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const valid = url === api + '/ready' ? r.ok && (await r.json()).data?.status === 'ready' : r.ok && (await r.text()).includes('<html');
    return { url, ok: valid, status: r.status, ms: Date.now() - started };
  } catch { return { url, ok: false, error: 'unreachable-or-timeout', ms: Date.now() - started }; }
}));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every(r => r.ok) ? 0 : 1;
