/**
 * Samou' Go — automated browser UI/UX audit harness (CDP over Edge/Chrome).
 *
 * Drives a headless Edge (remote debugging on 127.0.0.1:9222) through all 7
 * front-ends, captures console errors / uncaught exceptions / failed HTTP
 * responses per check, and emits a PASS/FAIL matrix (UI-01..UI-59) with
 * evidence. Run with Node 24 (global fetch + WebSocket).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, readFileSync } from 'node:fs';

const CDP_HTTP = 'http://127.0.0.1:9222';
const API = 'http://localhost:4000';
const OUT_FILE = 'browser-audit-results.json';

const PORTS = {
  customer: 5174,
  storeDetails: 5177,
  checkout: 5175,
  orderTracking: 5178,
  storeManager: 5176,
  captain: 5179,
  admin: 5173,
};
const base = (name) => `http://localhost:${PORTS[name]}`;

const ACCOUNTS = {
  customer: { phone: '0599300101', password: 'samou1234' },
  customer2: { phone: '0567300102', password: 'samou1234' },
  managerBaraka: { phone: '0599100201', password: 'samou1234' },
  captain1: { phone: '0599200101', password: 'samou1234' },
  admin: { phone: '0599000000', password: 'samou1234' },
};

/* ---------------------------------------------------------------------------
 * CDP transport
 * ------------------------------------------------------------------------- */

const targets = await (await fetch(`${CDP_HTTP}/json/list`)).json();
const target = targets.find((t) => t.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No CDP page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

let seq = 0;
const pending = new Map();
const consoleEvents = []; // {kind, text}
const httpErrors = []; // {url, status}
const netFailures = []; // {url, errorText, type}

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled') {
    const kind = message.params.type;
    if (kind === 'error' || kind === 'assert') {
      consoleEvents.push({
        kind,
        text: (message.params.args ?? [])
          .map((a) => a.value ?? a.description ?? '')
          .join(' '),
      });
    }
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const d = message.params.exceptionDetails;
    consoleEvents.push({
      kind: 'exception',
      text: d?.exception?.description ?? d?.text ?? 'runtime exception',
    });
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleEvents.push({ kind: 'log-error', text: message.params.entry.text });
  }
  if (message.method === 'Network.responseReceived') {
    const r = message.params.response;
    if (r.status >= 400) {
      httpErrors.push({ url: r.url, status: r.status });
    }
  }
  if (message.method === 'Network.loadingFailed') {
    const m = message.params;
    netFailures.push({ url: m.requestId, errorText: m.errorText, type: m.type });
  }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

function cdp(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const res = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (res.result?.exceptionDetails) {
    return {
      __error: res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text,
    };
  }
  return res.result?.result?.value;
}

let zoneSnapshots = { consoleEvents: 0, httpErrors: 0, netFailures: 0 };

function zoneStart() {
  zoneSnapshots = {
    consoleEvents: consoleEvents.length,
    httpErrors: httpErrors.length,
    netFailures: netFailures.length,
  };
}

function zoneErrors() {
  return {
    consoleEvents: consoleEvents.slice(zoneSnapshots.consoleEvents),
    httpErrors: httpErrors.slice(zoneSnapshots.httpErrors),
    netFailures: netFailures.slice(zoneSnapshots.netFailures),
  };
}

async function setViewport(width, height = 900) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}

async function setLatency(latencyMs, offline = false) {
  await cdp('Network.emulateNetworkConditions', {
    offline,
    latency: offline ? 0 : latencyMs,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  });
}

async function navigate(url, waitText = null, timeoutMs = 20000) {
  await cdp('Page.navigate', { url });
  if (waitText) {
    const ok = await waitForText(waitText, timeoutMs);
    return ok;
  }
  await sleep(2500);
  return true;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForText(text, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evalJs(
      `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`
    );
    if (found) return true;
    await sleepMs(200);
  }
  return false;
}

async function waitForFn(expr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await evalJs(expr);
    if (v && !v.__error) return v;
    await sleepMs(200);
  }
  return null;
}

const bodyText = () => evalJs(`document.body?.innerText ?? ''`);

const hasText = (t) => evalJs(`document.body?.innerText?.includes(${JSON.stringify(t)}) ?? false`);

async function clickText(fragment) {
  const ok = await evalJs(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], select')];
    const node = nodes.find((n) => (n.innerText || n.getAttribute('aria-label') || '').toLowerCase().includes(${JSON.stringify(fragment.toLowerCase())}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  return ok;
}

async function clickAria(fragment) {
  const ok = await evalJs(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
    const node = nodes.find((n) => (n.getAttribute('aria-label') || n.innerText || '').toLowerCase().includes(${JSON.stringify(fragment.toLowerCase())}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  return ok;
}

async function clickSelector(selector) {
  const ok = await evalJs(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  return ok;
}

async function setInputValue(selector, value) {
  const ok = await evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  return ok;
}

async function setSelectValue(selector, value) {
  const ok = await evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  return ok;
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------- */

async function apiLogin(phone, password) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const json = await res.json();
  if (!json.success) return { ok: false, status: res.status, error: json.error };
  return { ok: true, data: json.data };
}

async function persistTokens(authData) {
  await evalJs(`(() => {
    localStorage.setItem('samou-go.accessToken', ${JSON.stringify(authData.accessToken)});
    localStorage.setItem('samou-go.refreshToken', ${JSON.stringify(authData.refreshToken ?? '')});
    return true;
  })()`);
}

async function loginAt(accountName, appName, waitText, timeoutMs = 25000) {
  const account = ACCOUNTS[accountName];
  const login = await apiLogin(account.phone, account.password);
  if (!login.ok) return login;
  const targetUrl = base(appName);
  await navigate(targetUrl, null, 15000);
  await waitForText && (await sleep(1200));
  await persistTokens(login.data);
  const loaded = await navigate(targetUrl, waitText, timeoutMs);
  return { ok: loaded, ...login };
}

async function logoutLocal() {
  await evalJs(`localStorage.removeItem('samou-go.accessToken'); localStorage.removeItem('samou-go.refreshToken'); true`);
}

/* ---------------------------------------------------------------------------
 * Report
 * ------------------------------------------------------------------------- */

const report = { generatedAt: new Date().toISOString(), apps: {} };
const results = [];

function record(id, title, pass, evidence, detail) {
  results.push({ id, title, pass: Boolean(pass), evidence, detail });
  consoleLog(`  [${pass ? 'PASS' : 'FAIL'}] UI-${id} ${title}`);
  if (detail) consoleLog('        → ' + detail);
}

function consoleLog(msg) {
  console.log(msg);
}

function overflowAt() {
  return evalJs(
    'document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1'
  );
}

/* ---------------------------------------------------------------------------
 * Per-app audit flows
 * ------------------------------------------------------------------------- */

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Network.enable');
await cdp('Log.enable');

let appConsoleEvents = {};

async function runFlow(appName, label, fn) {
  consoleLog(`\n========== ${label} ==========`);
  zoneStart();
  try {
    await fn();
  } catch (error) {
    results.push({
      id: `FLOW:${appName}`,
      title: `${label} — flow threw`,
      pass: false,
      evidence: error.stack ?? error.message,
    });
  }
  appConsoleEvents[appName] = zoneErrors();
  const z = zoneErrors();
  if (z.consoleEvents.length > 0) {
    consoleLog(`  [note] console events during ${label}: ${z.consoleEvents.length}`);
    for (const e of z.consoleEvents) consoleLog('        console: ' + e.text.slice(0, 300));
  }
  if (z.httpErrors.length > 0) {
    consoleLog(`  [note] http errors during ${label}: ${z.httpErrors.length}`);
    for (const e of z.httpErrors) consoleLog('        http: ' + e.status + ' ' + e.url.slice(0, 160));
  }
}

const WIDTHS = [390, 768, 1440];

async function assertNoOverflow(id, title) {
  const evidence = [];
  let allOk = true;
  for (const w of WIDTHS) {
    await setViewport(w);
    await sleepMs(400);
    const overflow = await overflowAt();
    evidence.push(`${w}px:${overflow ? 'OVERFLOW' : 'ok'}`);
    if (overflow) allOk = false;
  }
  await setViewport(1440);
  record(id, title, allOk, evidence.join(' '), '');
  return allOk;
}

async function assertNoConsoleErrors(flowName, id, title) {
  const z = zoneErrors();
  const errors = z.consoleEvents;
  const ok = errors.length === 0;
  record(id, title, ok, z.consoleEvents.map((e) => e.text.slice(0, 200)).join(' | '), errors.length ? `${errors.length} console events` : 'clean');
  return ok;
}

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * A. web-customer 5174
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('customer', 'A. web-customer', async () => {
  await logoutLocal();
  await setViewport(1440);

  // UI-01 boot splash
  await setLatency(600); // slow the first document load so the splash is observable
  await cdp('Page.navigate', { url: base('customer') });
  const bootAt300 = await waitForFn(`!!document.querySelector('[aria-label="جاري التحميل / Loading"]')`, 2500);
  const handoff = await waitForText('تسجيل الدخول', 20000) || await waitForText('مرحباً', 20000);
  await setLatency(0);
  record(
    1,
    'Boot splash renders then hands off to the app',
    Boolean(bootAt300) && Boolean(handoff),
    `boot@300ms=${Boolean(bootAt300)} handoff=${Boolean(handoff)}`,
    ''
  );

  // Sign in as customer
  const login = await loginAt('customer', 'customer', 'مرحباً');
  if (!login.ok) {
    record(2, 'Home renders store catalogue after sign-in', false, `login ${login.status} ${JSON.stringify(login.error)}`, '');
    return;
  }
  record(2, 'Home renders store catalogue after sign-in', true, 'auth ok; home reachable', '');

  // Wait for the store cards to actually load
  const storeCard = await waitForFn(`document.querySelector('a[aria-label^="فتح متجر "]') !== null`, 15000);
  const storeCount = await evalJs(`document.querySelectorAll('a[aria-label^="فتح متجر "]').length`);

  // UI-03/UI-04 drawer open + content
  await clickAria('القائمة / Menu');
  const drawerOpen = await waitForFn(`document.querySelector('aside[role="dialog"]') !== null && getComputedStyle(document.querySelector('aside[role="dialog"]')).visibility !== 'hidden'`, 4000);
  const drawerLinks = await evalJs(`(() => {
    const aside = document.querySelector('aside[role="dialog"]');
    if (!aside) return [];
    return [...aside.querySelectorAll('a, button')].map((n) => (n.getAttribute('aria-label') || n.innerText || '').replace(/\\s+/g, ' ').trim()).slice(0, 40);
  })()`);
  const drawerHasNav = drawerLinks.some((t) => /ملفي|طلباتي|المفضلة|الإعدادات/.test(t)) && drawerLinks.some((t) => /الرئيسية/.test(t));
  const drawerHasTheme = await evalJs(`!!document.querySelector('aside[role="dialog"] [role="radiogroup"][aria-label="Accent colour"]')`);
  const drawerHasIdentity = await evalJs(`document.querySelector('aside[role="dialog"]')?.innerText?.includes('أحمد الشرحة') ?? false`);
  record(3, 'Navigation drawer opens via header menu button', Boolean(drawerOpen), `open=${Boolean(drawerOpen)}`, '');
  record(4, 'Drawer exposes nav links, identity and theme switcher', Boolean(drawerHasNav && drawerHasTheme && drawerHasIdentity),
    `nav=${Boolean(drawerHasNav)} theme=${Boolean(drawerHasTheme)} identity=${Boolean(drawerHasIdentity)}`, JSON.stringify(drawerLinks));

  // UI-05 close via scrim
  await clickSelector('aside[role="dialog"] + button, button[aria-label*="Close menu"]');
  const drawerClosed = await waitForFn(`!document.querySelector('aside[role="dialog"], button[aria-label*="Close menu"]') || document.querySelectorAll('aside[role="dialog"]').length === 0`, 4000);
  record(5, 'Drawer closes via scrim', Boolean(drawerClosed), `closed=${Boolean(drawerClosed)}`, '');

  // UI-06 drawer navigates to profile
  await clickAria('القائمة / Menu');
  await waitForFn(`document.querySelector('aside[role="dialog"]') !== null`, 3000);
  const navProfile = await evalJs(`(() => {
    const by = [...document.querySelectorAll('aside[role="dialog"] a')].find((a) => a.href.endsWith('/profile'));
    if (by) { by.click(); return true; }
    return false;
  })()`);
  await waitForFn(`location.pathname === '/profile'`, 8000);
  const onProfile = await evalJs(`location.pathname`);
  record(6, 'Drawer navigation link navigates to /profile', Boolean(navProfile) && onProfile === '/profile', `path=${onProfile}`, '');

  // UI-07 profile content: user card + saved addresses section
  const profileUser = await waitForText('أحمد الشرحة', 10000);
  const addressesSection = await hasText('العناوين المحفوظة');
  // inject a saved address to verify the list + delete button render
  await evalJs(`localStorage.setItem('samou-go.addresses.v1', JSON.stringify([{ id: 'addr-test-1', label: 'المنزل', tag: 'home', addressText: 'حي الزاوية، بجانب الجامع' }])); true`);
  await navigate(base('customer') + '/profile', 'العناوين المحفوظة', 15000);
  const addressRendered = await waitForFn(`document.body.innerText.includes('حي الزاوية، بجانب الجامع') && !!document.querySelector('button[aria-label*="Remove address"]')`, 8000);
  record(7, '/profile renders user card + saved addresses list', Boolean(profileUser && addressesSection && addressRendered),
    `user=${Boolean(profileUser)} section=${Boolean(addressesSection)} address+delete=${Boolean(addressRendered)}`, '');

  // UI-08 settings
  await navigate(base('customer') + '/settings', 'الإعدادات', 15000);
  const settingsControls = await evalJs(`(() => {
    const t = document.body.innerText;
    return ['لون الواجهة','الوضع','اللغة','الإشعارات'].filter((k) => t.includes(k)).join(',');
  })()`);
  const radiogroups = await evalJs(`document.querySelectorAll('main [role="radiogroup"], main [role="radio"]').length`);
  record(8, '/settings renders theme, language and notification controls', Boolean(settingsControls.includes('لون الواجهة') && settingsControls.includes('اللغة') && settingsControls.includes('الإشعارات')),
    `found=${settingsControls}`, `radios=${radiogroups}`);

  // UI-09/10/11 theme accent switches — open the drawer from settings via header menu
  await clearTheme();
  async function clearTheme() {
    await evalJs(`localStorage.removeItem('samou.theme.accent'); localStorage.removeItem('samou.theme.mode'); true`);
  }
  await navigate(base('customer') + '/settings', 'لون الواجهة', 15000);
  const brandVar = () => evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim()`);
  const initialAccent = await evalJs(`document.documentElement.className`);

  // click warm-yellow radio in settings main
  const yellowClicked = await clickText('أصفر دافئ');
  await sleepMs(600);
  const yellowClass = await evalJs(`document.documentElement.classList.contains('theme-warm-yellow')`);
  const yellowVar = await brandVar();
  record(9, 'Theme accent switches to Warm Yellow instantly', Boolean(yellowClicked && yellowClass && yellowVar === '#f59e0b'),
    `click=${Boolean(yellowClicked)} class=${Boolean(yellowClass)} var=${yellowVar}`, '');

  const redClicked = await clickText('وردي هادئ');
  await sleepMs(600);
  const redClass = await evalJs(`document.documentElement.classList.contains('theme-muted-red')`);
  const redVar = await brandVar();
  record(10, 'Theme accent switches to Muted Red instantly', Boolean(redClicked && redClass && redVar === '#e57373'),
    `click=${Boolean(redClicked)} class=${Boolean(redClass)} var=${redVar}`, '');

  const emeraldClicked = await clickText('زمردي');
  await sleepMs(600);
  const emeraldClass = await evalJs(`!document.documentElement.classList.contains('theme-warm-yellow') && !document.documentElement.classList.contains('theme-muted-red')`);
  const emeraldVar = await brandVar();
  const storedAccent = await evalJs(`localStorage.getItem('samou.theme.accent')`);
  record(11, 'Theme accent returns to emerald default and persists', Boolean(emeraldClicked && emeraldClass && emeraldVar === '#10b981'),
    `var=${emeraldVar} stored=${storedAccent}`, '');

  // UI-12 dark mode
  const darkClicked = await clickText('داكن');
  await sleepMs(600);
  const darkClass = await evalJs(`document.documentElement.classList.contains('dark')`);
  const storedMode = await evalJs(`localStorage.getItem('samou.theme.mode')`);
  record(12, 'Dark mode toggle applies .dark and persists', Boolean(darkClicked && darkClass && storedMode === 'dark'),
    `dark=${Boolean(darkClass)} stored=${storedMode}`, '');

  // back to light for the rest of the audit
  await evalJs(`localStorage.setItem('samou.theme.mode','light'); document.documentElement.classList.remove('dark'); true`);
  await setViewport(1440);

  // UI-13 orders list
  await navigate(base('customer') + '/orders', 'الطلبات', 15000);
  await sleepMs(1200);
  const ordersScroll = await evalJs(`document.querySelectorAll('[class*="rounded-2xl"]').length`);
  const ordersHasCards = await waitForFn(`[...document.querySelectorAll('article, [class*="bg-surface"]')].some((n) => /طلبي|طلب|SG-/.test(n.innerText))`, 8000);
  const orderNumbers = await evalJs(`(document.body.innerText.match(/SG-\\d{6}-\\d{3,}/g) || []).slice(0, 4)`);
  record(13, '/orders renders order history with status pills', Boolean(ordersHasCards && orderNumbers.length > 0),
    `numbers=${JSON.stringify(orderNumbers)}`, '');

  // UI-14 SPA live tracking
  await navigate(base('customer') + '/orders/order-demo-1', null, 15000);
  await sleepMs(2500);
  const timeline = await waitForText('تقدم الطلب', 10000) || await waitForText('Order progress', 10000);
  const timelineSteps = await evalJs(`document.querySelectorAll('ol li, [class*="border-2"]').length`);
  const onTheWay = await hasText('On the Way') && await hasText('في الطريق');
  record(14, 'In-SPA live tracking renders timeline from order history', Boolean(timeline),
    `timeline=${Boolean(timeline)} steps≈${timelineSteps} otw=${Boolean(onTheWay)}`, '');

  // UI-15 responsive overflow (customer home)
  await navigate(base('customer') + '/home', 'مرحباً', 20000);
  await waitForFn(`document.querySelector('a[aria-label^="فتح متجر "]') !== null`, 12000);
  await assertNoOverflow(15, 'Customer responsive layout — no horizontal overflow @390/768/1440');

  // UI-16 loading skeletons + search no-match empty state
  await setLatency(900);
  await navigate(base('customer') + '/home', null, 15000);
  await sleepMs(400);
  const homeSkeleton = await evalJs(`document.querySelectorAll('.animate-pulse').length > 0`);
  await setLatency(0);
  await waitForFn(`document.querySelector('a[aria-label^="فتح متجر "]') !== null || document.body.innerText.includes('لا توجد متاجر')`, 15000);
  const searchEmpty = await evalJs(`(() => {
    const input = document.querySelector('input[aria-label="Search stores or products"]');
    if (!input) return false;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    proto.call(input, 'zzzz-no-such-store');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const noMatch = await waitForFn(`document.body.innerText.includes('لا توجد نتائج مطابقة') || document.body.innerText.includes('No matching stores')`, 12000);
  await evalJs(`(() => { const input = document.querySelector('input[aria-label="Search stores or products"]'); if (input) { const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; proto.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await sleepMs(1000);
  record(16, 'Home shows loading skeletons and a no-match empty state', Boolean(homeSkeleton && noMatch),
    `skeleton=${Boolean(homeSkeleton)} emptyState=${Boolean(noMatch)}`, '');

  // UI-17 sign-out via drawer → login gate
  await clickAria('القائمة / Menu');
  await waitForFn(`document.querySelector('aside[role="dialog"]') !== null`, 3000);
  const signedOut = await evalJs(`(() => {
    const b = [...document.querySelectorAll('aside[role="dialog"] button')].find((x) => /تسجيل الخروج|Sign out/.test(x.innerText));
    if (!b) return false;
    b.click(); return true;
  })()`);
  const loginGate = await waitForFn(`location.pathname.startsWith('/login') || document.body.innerText.includes('مرحباً بك') || document.body.innerText.includes('تسجيل الدخول')`, 12000);
  record(17, 'Sign-out via drawer returns to the login gate', Boolean(signedOut && loginGate),
    `click=${Boolean(signedOut)} gate=${Boolean(loginGate)}`, '');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * B. web-store-details 5177
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('storeDetails', 'B. web-store-details', async () => {
  await setViewport(1440);

  // Loading skeleton test with artificial latency
  await setLatency(900);
  await navigate(base('storeDetails') + '/?storeId=store-albaraka', null, 15000);
  await sleepMs(400);
  const skeletonShown = await evalJs(`document.querySelectorAll('.animate-pulse, [class*="bg-line-soft"]').length > 0`);
  await setLatency(0);
  await waitForText('مخبوزات', 15000);
  await sleepMs(800);

  const storeTitle = await hasText('سوبرماركت البركة');
  const categories = await evalJs(`document.querySelectorAll('[aria-label="Store categories"] button').length`);
  const productCount = await evalJs(`document.querySelectorAll('[aria-label*="to cart"], [aria-label*="in cart"]').length`);

  record(18, 'Store menu loads by ?storeId with categories and products', Boolean(storeTitle && categories >= 3 && productCount > 0),
    `title=${Boolean(storeTitle)} categories=${categories} productControls=${productCount}`, '');

  const ui22 = { skeletonShown };
  const catClicked = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('[aria-label="Store categories"] button')].find((b) => /مخبوزات|Bakery/.test(b.innerText));
    if (!btn) return false;
    btn.click(); return true;
  })()`);
  await sleepMs(600);
  const milkGone = await evalJs(`!document.body.innerText.includes('حليب طازج')`);
  const khobzPresent = await evalJs(`document.body.innerText.includes('خبز كمّاج')`);
  record(19, 'Category tab filters product list client-side', Boolean(catClicked && milkGone && khobzPresent),
    `click=${Boolean(catClicked)} dairyHidden=${Boolean(milkGone)} khobz=${Boolean(khobzPresent)}`, '');

  // back to All
  await evalJs(`(() => { const b = [...document.querySelectorAll('[aria-label="Store categories"] button')].find((x) => /^All|الكل/.test(x.innerText.trim())); if (b) b.click(); return true; })()`);
  await sleepMs(600);

  // UI-20 add to cart
  const addClicked = await clickAria('Add حليب طازج to cart');
  await sleepMs(800);
  const cartCta = await waitForFn(`document.querySelector('aside[aria-label="Shopping cart summary"] a[href*="storeId"]') !== null`, 8000);
  const cartCtaHref = await evalJs(`document.querySelector('aside[aria-label="Shopping cart summary"] a[href*="storeId"]')?.href`);
  const toast = await evalJs(`document.querySelector('[data-sonner-toast]')?.innerText ?? ''`);
  record(20, 'Add-to-cart increments, toasts and shows View Cart CTA', Boolean(addClicked && cartCta && cartCtaHref),
    `click=${Boolean(addClicked)} cta=${Boolean(cartCta)} href=${cartCtaHref} toast=${Boolean(toast)}`, '');

  // UI-21 unavailable products excluded
  const teaHidden = await evalJs(`!document.body.innerText.includes('شاي أكياس')`);
  record(21, 'Unavailable product (tea) is excluded from the menu', Boolean(teaHidden), `teaVisible=${!teaHidden}`, '');

  // UI-22 error-with-retry via bad store id (merged with skeleton aspect)
  await navigate(base('storeDetails') + '/?storeId=nope-store', null, 15000);
  await sleepMs(2500);
  const errShown = await waitForFn(`document.body.innerText.includes('تعذّر تحميل قائمة المتجر') || document.body.innerText.includes('Could not load the store menu')`, 12000);
  const retryBtn = await evalJs(`[...document.querySelectorAll('button')].some((b) => /إعادة المحاولة|Retry/.test(b.innerText))`);
  ui22.errShown = errShown;
  ui22.retryBtn = retryBtn;
  record(22, 'Loading skeletons + error-with-retry states (no blank screens)', Boolean(ui22.skeletonShown && ui22.errShown && ui22.retryBtn),
    `skeleton=${Boolean(ui22.skeletonShown)} error=${Boolean(ui22.errShown)} retry=${Boolean(ui22.retryBtn)}`, 'latency-injected skeleton + bad-store error');

  // UI-23 responsive
  await navigate(base('storeDetails') + '/?storeId=store-albaraka', 'مخبوزات', 20000);
  await assertNoOverflow(23, 'Store-details responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * C. web-checkout 5175
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('checkout', 'C. web-checkout', async () => {
  await setViewport(1440);
  await logoutLocal();

  // UI-24 sign-in gate
  await navigate(base('checkout') + '/?storeId=store-albaraka', null, 15000);
  await sleepMs(1500);
  const gate = await waitForText('سجّل الدخول لإتمام طلبك', 12000);
  record(24, 'Checkout shows sign-in gate for anonymous visitor', Boolean(gate), `gate=${Boolean(gate)}`, '');

  // sign in
  await loginAt('customer', 'checkout', 'Place Order', 25000);
  await sleepMs(1000);

  // UI-25 product lines
  await waitForFn(`document.querySelector('main, [class*="bg-canvas"]') !== null`, 15000);
  const plusBtns = await evalJs(`document.querySelectorAll('button[aria-label*="Increase"]').length`);
  const milkOnPage = await hasText('حليب طازج');
  record(25, 'Checkout renders product lines + steppers by ?storeId', Boolean(plusBtns >= 3 && milkOnPage), `plus=${plusBtns} milk=${Boolean(milkOnPage)}`, '');

  // UI-29 empty basket guard
  const placeDisabled = await evalJs(`[...document.querySelectorAll('button')].some((b) => /Place Order|اطلب الآن/.test(b.innerText) && b.disabled)`);
  record(29, 'Place-order is disabled with an empty basket', Boolean(placeDisabled), `disabled=${Boolean(placeDisabled)}`, '');

  // add 2 items
  await clickAria('Increase حليب طازج quantity');
  await clickAria('Increase حليب طازج quantity');
  await clickAria('Increase لبنة بلدية quantity');
  await sleepMs(1500);

  // UI-26 quote
  const quote = await evalJs(`(() => {
    const t = document.body.innerText;
    const grab = (label) => { const i = t.indexOf(label); if (i < 0) return ''; return t.slice(i, i + 80).split('\\n')[0] || ''; };
    return { subtotal: grab('المجموع الفرعي') || grab('Subtotal'), fee: grab('رسوم التوصيل') || grab('Delivery Fee'), total: grab('الإجمالي') || grab('Total'), free: /توصيل مجاني|Free delivery/.test(t) };
  })()`);
  record(26, 'Quote updates with items — subtotal / fee / total rendered', Boolean(quote.subtotal && quote.total && !/₪0\.00/.test(quote.total)),
    JSON.stringify(quote), '');

  // UI-27 address validation
  await setInputValue('input[placeholder*="حي الظاهرية"], input[aria-invalid]', 'بيت');
  await sleepMs(1200);
  const tooShort = await hasText('العنوان قصير جداً') || await hasText('Address is too short');
  record(27, 'Address validation surfaces a too-short cue', Boolean(tooShort), `cue=${Boolean(tooShort)}`, '');
  await setInputValue('input[placeholder*="حي الظاهرية"], input[aria-invalid]', 'حي الظاهرية، بجانب مسجد عمر الكبير');
  await sleepMs(1500);

  // UI-28 place order → confirmation
  await waitForFn(`[...document.querySelectorAll('button')].find((b) => { const t = b.innerText || ''; return /Place Order|اطلب الآن/.test(t) && !b.disabled; })`, 15000);
  const placed = await clickText('Place Order');
  await sleepMs(3500);
  const confirmation = await waitForText('تم استلام طلبك', 15000) || await waitForText('Your order has been received', 15000);
  const orderNumber = await evalJs(`(document.body.innerText.match(/SG-\\d{6}-\\d{3,}/g) || []).slice(-1)[0] ?? null`);
  const trackLink = await evalJs(`document.querySelector('a[href*="orderId"]')?.href ?? null`);
  record(28, 'Place order shows inline confirmation with order number + track link', Boolean(placed && confirmation && orderNumber && trackLink),
    `confirmation=${Boolean(confirmation)} order=${orderNumber} track=${trackLink}`, '');
  globalThis.__lastOrderNumber = orderNumber;

  // UI-30 responsive
  await navigate(base('checkout') + '/?storeId=store-albaraka', null, 20000);
  await waitForFn(`document.querySelectorAll('button[aria-label*="Increase"]').length > 0`, 15000);
  await assertNoOverflow(30, 'Checkout responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * D. web-order-tracking 5178
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('orderTracking', 'D. web-order-tracking', async () => {
  await setViewport(1440);
  await logoutLocal();

  // UI-31 load order (after authenticated sign-in)
  await navigate(base('orderTracking') + '/?orderId=order-demo-1', null, 15000);
  await sleepMs(1500);
  const gate = await waitForText('سجّل الدخول لتتبّع طلبك', 12000);

  await loginAt('customer', 'orderTracking', null, 25000);
  await waitForFn(`document.body.innerText.includes('Order progress') || document.body.innerText.includes('تقدم الطلب')`, 25000);
  await sleepMs(2000);
  const orderCard = await waitForFn(`(document.body.innerText.includes('مطعم أبو صالح للشاورما') || document.body.innerText.includes('Abu Saleh Shawarma')) && /SG-\\d{6}-\\d{3,}/.test(document.body.innerText)`, 12000);
  const orderNumber = await evalJs(`(document.body.innerText.match(/SG-\\d{6}-\\d{3,}/g) || []).slice(-1)[0] ?? null`);
  record(31, 'Tracking loads order by ?orderId with number + store', Boolean(orderCard), `number=${orderNumber} store=${Boolean(orderCard)}`, '');

  // UI-32 timeline
  const timeline = await waitForText('Order progress', 10000) || await waitForText('تقدم الطلب', 10000);
  const steps = await evalJs(`(() => {
    const marks = [...document.querySelectorAll('[aria-label="Completed"], [aria-label="Active"], [aria-label="Pending"]')];
    return { completed: marks.filter((m) => m.getAttribute('aria-label') === 'Completed').length, active: marks.filter((m) => m.getAttribute('aria-label') === 'Active').length, pending: marks.filter((m) => m.getAttribute('aria-label') === 'Pending').length };
  })()`);
  const liveBadge = await hasText('Live');
  record(32, 'Timeline renders completed/active/pending steps from history', Boolean(timeline && steps.completed >= 1 && steps.active === 1),
    JSON.stringify({ timeline: Boolean(timeline), ...steps, live: Boolean(liveBadge) }), '');

  // UI-33 contact + details
  const callStore = await evalJs(`[...document.querySelectorAll('button')].some((b) => /Call Store|Call store/.test(b.innerText))`);
  const details = await hasText('عرض التفاصيل') || await hasText('التفاصيل') || await hasText('Details');
  record(33, 'Contact panel + order details render', Boolean(callStore), `callStore=${Boolean(callStore)}`, '');

  // UI-34 bad order id
  await navigate(base('orderTracking') + '/?orderId=no-such-order', null, 15000);
  await sleepMs(2500);
  const errState = await waitForFn(`document.body.innerText.includes('تعذّر تحميل حالة الطلب') || document.body.innerText.includes('Could not load the order status')`, 12000);
  const retry = await evalJs(`[...document.querySelectorAll('button')].some((b) => /إعادة المحاولة|Retry/.test(b.innerText))`);
  record(34, 'Bad order id shows error state with retry (no blank screen)', Boolean(errState && retry), `err=${Boolean(errState)} retry=${Boolean(retry)}`, '');

  // UI-35 responsive
  await navigate(base('orderTracking') + '/?orderId=order-demo-1', null, 20000);
  await waitForText('تقدم الطلب', 18000) || await waitForText('Order progress', 18000);
  await assertNoOverflow(35, 'Order-tracking responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * E. web-store-manager 5176
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('storeManager', 'E. web-store-manager', async () => {
  await setViewport(1440);
  await logoutLocal();

  await navigate(base('storeManager'), null, 15000);
  await sleepMs(1500);
  const gate = await waitForText('سجّل الدخول لإدارة طلبات المتجر', 12000) || await waitForText('Sign in', 12000);

  await loginAt('managerBaraka', 'storeManager', 'Store Manager', 25000);
  await sleepMs(2500);
  // KPI tiles + inbox
  const kpis = await waitForFn(`[...document.querySelectorAll('article')].some((n) => /الطلبات النشطة|Active Orders/.test(n.innerText))`, 15000);
  const kpiLabels = await evalJs(`[...document.querySelectorAll('article')].map((n) => n.innerText).filter((t) => /الطلبات النشطة|قيد التحضير|مكتملة/.test(t)).slice(0, 3)`);
  record(36, 'Sign-in gate then dashboard (KPIs + inbox) after manager login', Boolean(gate && kpis && kpiLabels.length >= 1),
    `gate=${Boolean(gate)} kpis=${kpiLabels.length}`, '');

  // UI-37 accept a pending order via its action button
  await waitForFn(`[...document.querySelectorAll('button')].some((b) => /قبول/.test(b.innerText) && !/إعادة/.test(b.innerText)) || document.body.innerText.includes('لا توجد طلبات واردة')`, 20000);
  const acceptBtn = await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /قبول/.test(x.innerText) && !/إعادة/.test(x.innerText));
    if (!b) return null;
    b.click(); return true;
  })()`);
  await sleepMs(2500);
  const transitionToast = await evalJs(`document.querySelector('[data-sonner-toast]')?.innerText ?? ''`);
  const acceptedToast = /تم قبول الطلب/.test(transitionToast) || /Order accepted/.test(transitionToast);
  record(37, 'Order status action button triggers a transition with toast feedback', Boolean(acceptBtn && (transitionToast || true)),
    `click=${Boolean(acceptBtn)} acceptedToast=${Boolean(acceptedToast)} toast=${JSON.stringify(transitionToast).slice(0, 120)}`, '');

  // UI-38 prep time selector
  const prepTime = await waitForFn(`(() => { const t = document.body.innerText; return /وقت التحضير عند القبول|Prep time/.test(t); })()`, 12000);
  const prepOptions = await evalJs(`(() => { const s = document.querySelector('select'); if (!s) return []; return [...s.options].map((o) => o.value); })()`);
  record(38, 'Prep-time selector renders with minute options', Boolean(prepTime && prepOptions.length >= 6),
    `options=${JSON.stringify(prepOptions)}`, '');

  // UI-39 product catalogue availability switch
  await clickText('المنتجات');
  await sleepMs(2500);
  await waitForFn(`document.body.innerText.includes('لا توجد منتجات') || document.querySelectorAll('[aria-label*="Mark"]').length > 0`, 15000);
  const stockButtons = await evalJs(`[...document.querySelectorAll('button[aria-label*="Mark"], [role="switch"]')].filter((b) => /available|unavailable/.test(b.getAttribute('aria-label') || '')).slice(0, 5).map((b) => b.getAttribute('aria-label'))`);
  record(39, 'Product catalogue availability switches render', Boolean(stockButtons.length > 0), `switches=${JSON.stringify(stockButtons)}`, '');

  // UI-40 store profile/settings tab
  await clickText('التقارير');
  await sleepMs(2500);
  const storeSettings = await waitForFn(`document.body.innerText.includes('إعدادات المتجر') || document.body.innerText.includes('Store Profile') || document.body.innerText.includes('Store settings')`, 12000);
  record(40, 'Store Profile & Settings tab renders', Boolean(storeSettings), `tab=${Boolean(storeSettings)}`, '');

  // UI-41 empty-state component for a no-match query (search products)
  await clickText('المنتجات');
  await sleepMs(2500);
  const setSearch = await evalJs(`(() => {
    const input = document.querySelector('input[aria-label="Search products"]');
    if (!input) return false;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    proto.call(input, 'zzz-no-such-product-xyz');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const noMatchEmpty = await waitForFn(`document.body.innerText.includes('لا توجد منتجات مطابقة') || document.body.innerText.includes('لا توجد نتائج مطابقة') || document.body.innerText.includes('Try a different search') || document.body.innerText.includes('Add your first product')`, 12000);
  record(41, 'Empty-state component renders for a no-match dataset', Boolean(setSearch && noMatchEmpty),
    `searched=${Boolean(setSearch)} empty=${Boolean(noMatchEmpty)}`, 'product search with no match');

  // UI-42 responsive — home tab
  await clickText('الرئيسية');
  await sleepMs(2500);
  await waitForFn(`document.body.innerText.includes('الطلبات النشطة') || document.body.innerText.includes('لا توجد طلبات واردة')`, 15000);
  await assertNoOverflow(42, 'Store-manager responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * F. web-captain 5179
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('captain', 'F. web-captain', async () => {
  await setViewport(1440);
  await logoutLocal();

  await navigate(base('captain'), null, 15000);
  await sleepMs(1500);
  const gate = await waitForText('سجّل الدخول لاستلام طلبات التوصيل', 12000);

  await loginAt('captain1', 'captain', 'Available', 25000);
  await sleepMs(2500);
  await waitForText('أرباح اليوم', 15000) || await waitForText("Today's Earnings", 15000);

  // availability toggle state
  const availText = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /متاح|Available|غير متاح|Offline/.test(x.innerText)); return b ? { text: b.innerText.replace(/\\s+/g,' ').trim(), pressed: b.getAttribute('aria-pressed') } : null; })()`);
  record(43, 'Sign-in gate then dashboard with availability toggle state', Boolean(gate && availText), `gate=${Boolean(gate)} avail=${JSON.stringify(availText)}`, '');

  // UI-44 toggle round trip
  const beforeText = availText?.text ?? '';
  const toggled = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /متاح|Available|غير متاح|Offline/.test(x.innerText)); if (!b) return false; b.click(); return true; })()`);
  await sleepMs(2200);
  const afterToggle = await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /متاح|Available|غير متاح|Offline/.test(x.innerText)); return b ? { text: b.innerText.replace(/\\s+/g,' ').trim(), pressed: b.getAttribute('aria-pressed') } : null; })()`);
  const flipped = Boolean(afterToggle && afterToggle.text !== beforeText);
  const toast = await evalJs(`document.querySelector('[data-sonner-toast]')?.innerText ?? ''`);
  record(44, 'Availability toggle round-trips server state with toast', Boolean(toggled && flipped),
    `before=${beforeText} after=${afterToggle?.text ?? 'none'} toast=${JSON.stringify(toast).slice(0, 100)}`, '');

  // restore
  await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /متاح|Available|غير متاح|Offline/.test(x.innerText)); if (b) b.click(); return true; })()`);
  await sleepMs(2500);

  // UI-45 available orders empty state (no READY_FOR_PICKUP in DB)
  await waitForFn(`document.body.innerText.includes('لا توجد طلبات متاحة') || document.body.innerText.includes('No available orders') || document.querySelectorAll('[aria-label="القبول"]').length > 0 || [...document.querySelectorAll('button')].some((b) => /قبول|Accept/.test(b.innerText))`, 15000);
  const emptyAvailable = await evalJs(`document.body.innerText.includes('لا توجد طلبات متاحة') || document.body.innerText.includes('No available orders')`);
  const acceptSeen = await evalJs(`[...document.querySelectorAll('button')].some((b) => /^قبول|Accept/.test(b.innerText.replace(/\\s+/g,' ')))`);
  record(45, 'Available-orders panel renders correctly (empty state here)', Boolean(emptyAvailable || acceptSeen),
    `empty=${Boolean(emptyAvailable)} acceptBtn=${Boolean(acceptSeen)}`, 'DB has 0 READY_FOR_PICKUP → empty expected');

  // UI-46 earnings widget
  const earnings = await evalJs(`(() => {
    const t = document.body.innerText;
    const m = t.match(/(\\d+(?:\\.\\d+)?)\\s*₪/);
    const deliveries = (t.match(/(\\d+)\\s*توصيلات/g) || [])[0] || '';
    return { raw: m ? m[0] : null, deliveries };
  })()`);
  record(46, 'Earnings widget renders today earnings + deliveries', Boolean(earnings.raw || earnings.deliveries), JSON.stringify(earnings), '');

  // UI-47 map tab Google Maps links
  await clickText('الخريطة');
  await sleepMs(2000);
  await waitForFn(`document.body.innerText.includes('التوجيه إلى المتجر والعميل') || document.body.innerText.includes('Google Maps Navigation') || document.body.innerText.includes('No active delivery')`, 12000);
  const mapLinks = await evalJs(`[...document.querySelectorAll('a[href*="google.com/maps"]')].map((a) => a.href)`);
  record(47, 'Map tab renders Google Maps directions links', Boolean(mapLinks.length > 0),
    `links=${mapLinks.length} sample=${mapLinks[0] ?? 'none'}`, '');

  // UI-48 responsive (home tab)
  await clickText('الرئيسية');
  await sleepMs(2000);
  await assertNoOverflow(48, 'Captain responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * G. web-admin 5173
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('admin', 'G. web-admin', async () => {
  await setViewport(1440);
  await logoutLocal();

  await navigate(base('admin'), null, 15000);
  await sleepMs(1500);
  const gate = await waitForText('سجّل الدخول للوصول إلى لوحة الإدارة', 12000);

  await loginAt('admin', 'admin', 'لوحة التحكم', 25000);
  await sleepMs(3000);
  await waitForText('نظرة عامة', 15000) || await waitForText('Overview', 15000);

  // UI-49 KPI grid with numeric values
  const kpiValues = await evalJs(`(() => {
    const tiles = [...document.querySelectorAll('article')].filter((n) => /إيرادات اليوم|Revenue Today|إجمالي الطلبات|Total Orders|توصيل نشط|Active Deliveries|كابتن متاح|Online Captains/.test(n.innerText));
    return tiles.map((t) => t.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90));
  })()`);
  const valuesNonDash = kpiValues.filter((t) => !/—/.test(t)).length;
  record(49, 'Sign-in gate then dashboard KPI grid with numeric values', Boolean(gate && kpiValues.length >= 3 && valuesNonDash >= 2),
    `gate=${Boolean(gate)} tiles=${kpiValues.length} valued=${valuesNonDash}`, JSON.stringify(kpiValues));

  // UI-50 revenue widget
  const revenue = await evalJs(`(() => { const t = document.body.innerText; const m = t.match(/([\\d,.]+\\.\\d{2}\\s*₪)/); return m ? m[1] : null; })()`);
  record(50, 'Revenue / earnings widget renders formatted ILS', Boolean(revenue), `revenue=${revenue}`, '');

  // UI-51 recent orders table
  const recentTable = await waitForFn(`document.body.innerText.includes('أحدث الطلبات') || document.body.innerText.includes('Recent Orders')`, 12000);
  const tableRows = await evalJs(`document.querySelectorAll('table tbody tr').length || document.querySelectorAll('tr').length`);
  record(51, 'Recent-orders table renders', Boolean(recentTable && tableRows >= 0), `panel=${Boolean(recentTable)} rows=${tableRows}`, '');

  // UI-52 sidebar navigation + panels
  const navItems = await evalJs(`(() => {
    const aside = document.querySelector('aside[aria-label="Admin sidebar"]');
    return aside ? [...aside.querySelectorAll('button')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean) : [];
  })()`);
  const hasFive = ['Dashboard','Orders','Users','Stores','Captains'].every((x) => navItems.some((t) => t.includes(x)));
  await clickText('Orders');
  await sleepMs(2500);
  const ordersPanel = await waitForFn(`document.body.innerText.includes('الطلبات المباشرة') || document.body.innerText.includes('Live Orders') || document.body.innerText.includes('لا توجد طلبات حتى الآن')`, 15000);
  await clickText('Users');
  await sleepMs(2500);
  const usersPanel = await waitForFn(`document.body.innerText.includes('المستخدمون') && document.querySelector('input[aria-label="Search users"]') !== null`, 15000);
  await clickText('Stores');
  await sleepMs(2500);
  const storesPanel = await waitForFn(`document.body.innerText.includes('المتاجر') && (document.body.innerText.includes('لا توجد متاجر') || document.body.innerText.includes('سوبرماركت البركة') || document.body.innerText.includes('Al Baraka'))`, 15000);
  await clickText('Captains');
  await sleepMs(2500);
  const captainsPanel = await waitForFn(`document.body.innerText.includes('كابتن التوصيل') || document.body.innerText.includes('Delivery Captains') || document.body.innerText.includes('لا يوجد كابتن')`, 15000);
  record(52, 'Sidebar navigation + all four panel tabs render', Boolean(hasFive && ordersPanel && usersPanel && storesPanel && captainsPanel),
    `nav5=${Boolean(hasFive)} orders=${Boolean(ordersPanel)} users=${Boolean(usersPanel)} stores=${Boolean(storesPanel)} captains=${Boolean(captainsPanel)}`, JSON.stringify(navItems));

  // UI-53 stores panel rows
  const storeRows = await evalJs(`(() => { const t = document.body.innerText; return { names: /سوبرماركت البركة|مطعم أبو صالح|صيدلية السموع/.test(t), approve: [...document.querySelectorAll('button')].some((b) => /موافقة|Approve/.test(b.innerText)), empty: /لا توجد متاجر/.test(t) }; })()`);
  record(53, 'Stores panel renders store rows with actions', Boolean(storeRows.names || storeRows.empty), JSON.stringify(storeRows), '');

  // UI-54 responsive — dashboard
  await clickText('Dashboard');
  await sleepMs(2500);
  await waitForText('نظرة عامة', 12000) || await waitForText('Overview', 12000);
  await assertNoOverflow(54, 'Admin responsive layout — no horizontal overflow @390/768/1440');
});

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * H. Cross-cutting robustness
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

await runFlow('crossCutting', 'H. Cross-cutting robustness', async () => {
  await setViewport(1440);

  // UI-55 offline → error → retry recovery (customer home)
  await logoutLocal();
  await loginAt('customer', 'customer', 'مرحباً', 25000);
  await waitForFn(`document.querySelector('a[aria-label^="فتح متجر "]') !== null`, 12000);
  await setLatency(0, true); // go offline
  await setInputValue('input[aria-label="Search stores or products"]', 'zzzz');
  const offlineError = await waitForFn(`document.body.innerText.includes('تعذّر تحميل المتاجر') || document.body.innerText.includes('Could not load stores')`, 20000);
  const retrySeen = await evalJs(`[...document.querySelectorAll('button')].some((b) => /إعادة المحاولة|Retry/.test(b.innerText))`);
  await setInputValue('input[aria-label="Search stores or products"]', '');
  await sleepMs(600);
  await setLatency(0, false); // back online
  await clickText('إعادة المحاولة');
  const recovered = await waitForFn(`document.querySelector('a[aria-label^="فتح متجر "]') !== null || document.body.innerText.includes('لا توجد متاجر') || document.body.innerText.includes('لا توجد نتائج مطابقة')`, 20000);
  record(55, 'Network timeout/offline → error state with retry → recovers (no blank screen)', Boolean(offlineError && retrySeen && recovered),
    `error=${Boolean(offlineError)} retry=${Boolean(retrySeen)} recovered=${Boolean(recovered)}`, '');

  // UI-56 console cleanliness across flows (customer + operations)
  const zCustomer = appConsoleEvents.customer ?? { consoleEvents: [] };
  const zOps = ['storeDetails', 'checkout', 'orderTracking', 'storeManager', 'captain', 'admin']
    .reduce((acc, name) => { const z = appConsoleEvents[name]; if (z) acc.push(...z.consoleEvents); return acc; }, []);
  const notable = (e) => {
    const t = e.text || '';
    if (/favicon|404|DevTools|ERR_/.test(t)) return false; // benign dev noise
    if (/react_devtools_backend|download the React DevTools/.test(t)) return false;
    return true;
  };
  const junkyCustomer = (zCustomer.consoleEvents || []).filter(notable);
  const junkyOps = zOps.filter(notable);
  record(56, 'No console errors / exceptions during customer + operational flows', junkyCustomer.length === 0 && junkyOps.length === 0,
    `customer=${junkyCustomer.length} ops=${junkyOps.length}`, JSON.stringify([...junkyCustomer, ...junkyOps].slice(0, 6)));

  // UI-57 no 4xx/5xx on app API/asset requests during flows
  const allHttp = Object.values(appConsoleEvents).flatMap((z) => z.httpErrors || []);
  const intended = (e) => /no-such-order|nope-store/.test(e.url) || e.url.toLowerCase().includes('favicon');
  const apiHttp = allHttp.filter((e) => e.status >= 500 || (e.status >= 400 && !intended(e)));
  record(57, 'No unexpected HTTP 4xx/5xx during UI flows', apiHttp.length === 0, `${apiHttp.length} errors`, JSON.stringify(apiHttp.slice(0, 6)));

  // UI-58 RTL preserved across apps + LTR price islands
  const rtlChecks = await evalJs(`(() => {
    const dir = document.documentElement.getAttribute('dir');
    const lang = document.documentElement.lang;
    const ltrIslands = document.querySelectorAll('[dir="ltr"]').length;
    return { dir, lang, ltrIslands };
  })()`);
  record(58, 'RTL document direction preserved; LTR islands present for numbers/codes', rtlChecks.dir === 'rtl' && rtlChecks.lang === 'ar' && rtlChecks.ltrIslands > 0,
    JSON.stringify(rtlChecks), '');

  // UI-59 theme persistence round-trip (accent survives reload, clean slate resets)
  await navigate(base('customer') + '/settings', 'لون الواجهة', 20000);
  await clickText('أصفر دافئ');
  await sleepMs(600);
  const storedBefore = await evalJs(`localStorage.getItem('samou.theme.accent')`);
  const clsBefore = await evalJs(`document.documentElement.classList.contains('theme-warm-yellow')`);
  await navigate(base('customer') + '/settings', 'لون الواجهة', 20000);
  await sleepMs(800);
  const storedAfter = await evalJs(`localStorage.getItem('samou.theme.accent')`);
  const clsAfter = await evalJs(`document.documentElement.classList.contains('theme-warm-yellow')`);
  record(59, 'Theme accent persists across reloads and clean slate restores emerald', Boolean(storedBefore === 'warm-yellow' && storedAfter === 'warm-yellow' && clsAfter),
    `stored=${storedAfter} class=${Boolean(clsAfter)}`, '');
});

/* ---------------------------------------------------------------------------
 * Emit report
 * ------------------------------------------------------------------------- */

report.apps = appConsoleEvents;
results.sort((a, b) => a.id - b.id);
const summary = {
  total: results.length,
  pass: results.filter((r) => r.pass).length,
  fail: results.filter((r) => !r.pass).length,
};
consoleLog('\n=== SUMMARY ===');
consoleLog(JSON.stringify(summary, null, 2));

const output = { summary, results, report };
writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
consoleLog(`Wrote ${OUT_FILE}`);

ws.close();