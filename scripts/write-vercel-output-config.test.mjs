import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOutputConfig } from './write-vercel-output-config.mjs';

test('prebuilt customer deployments retain nested routing and static-file precedence', async () => {
  const source = JSON.parse(await readFile(new URL('../themes/web-customer/vercel.json', import.meta.url), 'utf8'));
  const { routes } = buildOutputConfig(source);
  const filesystem = routes.findIndex((route) => route.handle === 'filesystem');
  const fallback = routes.findIndex((route) => route.dest === '/index.html');
  assert.ok(filesystem >= 0 && fallback > filesystem);
  assert.ok(new RegExp(routes[fallback].src).test('/orders/example-order'));
  const serviceWorker = routes.find((route) => route.headers?.['Service-Worker-Allowed']);
  assert.ok(new RegExp(serviceWorker.src).test('/service-worker.js'));
  assert.ok(!new RegExp(serviceWorker.src).test('/service-workerXjs'));
  assert.equal(serviceWorker.headers['Cache-Control'], 'no-cache, no-store, must-revalidate');
  assert.equal(serviceWorker.continue, true);
});
