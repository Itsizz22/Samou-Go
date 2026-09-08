import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, preview } from 'vite';

const executable = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((candidate) => candidate && existsSync(candidate));
if (!executable) throw new Error('Set CHROME_PATH to a Chromium browser executable');
const profile = await mkdtemp(path.join(tmpdir(), 'samou-session-browser-'));
const server = await createServer({ root: path.resolve('themes/web-customer'), server: { host: '127.0.0.1', port: 5188, strictPort: true } });
await server.listen();
const previewServer = await preview({ root: path.resolve('themes/web-customer'), preview: { host: '127.0.0.1', port: 5189, strictPort: true } });
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browserLog = '';
browser.stderr.on('data', (chunk) => { browserLog += chunk; });
let socket;
try {
  let targets;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      break;
    }
    catch { await delay(100); }
  }
  const target = targets?.find((candidate) => candidate.type === 'page' && candidate.url === 'about:blank');
  if (!target) throw new Error(`Browser page target did not start (exit ${browser.exitCode}): ${browserLog}`);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback?.reject(new Error(message.error.message));
      else callback?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.stopLoading');
  const testUrl = 'http://127.0.0.1:5188/tests/session.browser.html';
  const documentResponse = await fetch(testUrl);
  console.log(`Test document: ${documentResponse.status} ${documentResponse.headers.get('content-type')}`);
  const navigation = await send('Page.navigate', { url: testUrl });
  if (navigation.errorText && navigation.errorText !== 'net::ERR_ABORTED') throw new Error(navigation.errorText);
  let result;
  for (let attempt = 0; attempt < 150; attempt++) {
    const evaluation = await send('Runtime.evaluate', { expression: 'globalThis.sessionTestResult', returnByValue: true });
    result = evaluation.result?.value;
    if (result) break;
    if (errors.length) throw new Error(errors.join('\n'));
    await delay(200);
  }
  if (!result) {
    const page = await send('Runtime.evaluate', { expression: 'JSON.stringify({url: location.href, body: document.body.innerText})', returnByValue: true });
    throw new Error(`Browser session tests timed out: ${page.result?.value}`);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.error) process.exitCode = 1;
  const assets = await send('Runtime.evaluate', {
    expression: `(async () => {
      const url = 'http://127.0.0.1:5189/orders/test-order';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Nested route failed: ' + response.status);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const results = [];
      for (const selector of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
        const href = doc.querySelector(selector)?.getAttribute('href');
        if (!href?.startsWith('/')) throw new Error('Icon is not rooted at the origin');
        const icon = await fetch(new URL(href, url));
        if (!icon.ok) throw new Error('Icon failed: ' + icon.status);
        const bitmap = await createImageBitmap(await icon.blob());
        results.push({ path: href, status: icon.status, width: bitmap.width, height: bitmap.height });
        bitmap.close();
      }
      return results;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (assets.exceptionDetails) throw new Error(assets.exceptionDetails.exception?.description ?? 'Built asset verification failed');
  console.log('Built nested-route icons:', JSON.stringify(assets.result.value));
  await send('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  await server.close();
  await new Promise((resolve) => previewServer.httpServer.close(resolve));
}
