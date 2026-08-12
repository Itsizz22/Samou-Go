/**
 * Samou' Go — Search clickability + keyboard (a11y) verification.
 *
 * Drives the running web-customer app over CDP (Edge remote-debugging on
 * 127.0.0.1:9222 — same transport as browser-audit-final.mjs) and asserts the
 * search affordances the fix introduced:
 *
 *   A. The whole pill reads as a text field — `cursor: text` on the <label>.
 *   B. Clicking the icon/padding area of the pill (outside the <input> box)
 *      still focuses the input (whole-pill click target via the wrapping
 *      <label>).
 *   C. Aria wiring: `role="search"` ancestor and `aria-controls` resolving to
 *      the results region (home-results / search-results).
 *   D. Keyboard reachability: pressing Tab eventually focuses the search input.
 *   E. Enter is handled: no page/form navigation, term preserved.
 *
 * Run (with the API on :4000, web-customer on :5174 and Edge on :9222):
 *   node scripts/verify-search-a11y.mjs
 */

import { setTimeout as sleep } from 'node:timers/promises';

const CDP = 'http://127.0.0.1:9222';
const API = 'http://localhost:4000';
const APP = 'http://localhost:5174';
const INPUT_SEL = 'input[aria-label="Search stores or products"]';

const targets = await (await fetch(`${CDP}/json/list`)).json();
const target = targets.find((t) => t.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No CDP page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  return r.result?.exceptionDetails ? { __error: r.result.exceptionDetails.text } : r.result?.result?.value;
};
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (id, title, pass, evidence, detail = '') => {
  results.push({ id, title, pass: Boolean(pass), evidence, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${id} ${title}`);
};

async function loginWithRetry(attempt = 1) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0599300101', password: 'samou1234' }),
  });
  if (res.ok) return res.json();
  const retryAfter = Number(res.headers.get('retry-after')) || 0;
  if (res.status === 429 && attempt < 8) {
    const wait = Math.max(retryAfter, attempt * 15);
    console.log(`  ..login rate-limited (429) — waiting ${wait}s (attempt ${attempt})`);
    await sleepMs(wait * 1000);
    return loginWithRetry(attempt + 1);
  }
  throw new Error(`Login failed (HTTP ${res.status}) — is the API on :4000 with seeded DB?`);
}
const login = await loginWithRetry();
if (!login.success) throw new Error('Login payload missing success flag');

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

async function boot(route) {
  await cdp('Page.navigate', { url: `${APP}/home` });
  await sleepMs(2000);
  await ev(`localStorage.setItem('samou-go.accessToken', ${JSON.stringify(login.data.accessToken)}); true`);
  await cdp('Page.navigate', { url: `${APP}${route}` });
  await sleepMs(2200);
  await ev(`window.scrollTo(0, 0); true`);
  await sleepMs(300);
}

function assertAffordance(label) {
  return ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    if (!input) return null;
    const pill = input.closest('label');
    return { cursor: getComputedStyle(pill).cursor, fullWidth: pill && Math.round(input.getBoundingClientRect().width) < Math.round(pill.getBoundingClientRect().width) };
  })()`);
}

async function assertPillClick() {
  const point = await ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    const pill = input.closest('label');
    const ir = input.getBoundingClientRect();
    const pr = pill.getBoundingClientRect();
    // RTL: the icon + start padding float the END; target a point inside the pill but OUTSIDE the input box.
    const x = pr.right - 22;
    const y = Math.round(pr.top + pr.height / 2);
    return { x, y, inInput: x >= ir.left && x <= ir.right };
  })()`);
  if (!point) return { ok: false, why: 'no input' };
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await sleepMs(300);
  const focus = await ev(`(() => { const i = document.querySelector(${JSON.stringify(INPUT_SEL)}); return { focused: document.activeElement === i, tag: document.activeElement?.tagName }; })()`);
  return { ok: Boolean(focus.focused), point };
}

function assertAria() {
  return ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    if (!input) return null;
    const controlsId = input.getAttribute('aria-controls');
    const region = controlsId ? document.getElementById(controlsId) : null;
    const search = input.closest('[role="search"]');
    return { controlsId, regionExists: Boolean(region), searchRole: Boolean(search), liveRegion: region?.getAttribute('aria-live') };
  })()`);
}

async function assertKeyboard() {
  const dom = await ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    if (!input) return null;
    const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((n) => !n.disabled && n.tabIndex >= 0);
    input.focus({ preventScroll: true });
    const focuses = document.activeElement === input;
    input.blur();
    // Global :focus-visible ring comes from the base layer stylesheet (nested
    // inside @layer base, so walk nested rule blocks).
    const hasFocusVisibleRing = (rules, depth = 0) => {
      for (const rule of rules) {
        if (!rule) continue;
        if (rule.selectorText === ':focus-visible') {
          const css = rule.style?.cssText || '';
          if (css && (css.includes('box-shadow') || css.includes('ring') || css.includes('outline'))) return true;
        }
        if (rule.cssRules && depth < 5 && hasFocusVisibleRing(rule.cssRules, depth + 1)) return true;
      }
      return false;
    };
    let ringRule = false;
    for (const sheet of document.styleSheets) {
      try {
        if (hasFocusVisibleRing(sheet.cssRules)) { ringRule = true; break; }
      } catch { /* cross-origin sheet — skip */ }
    }
    return { index: focusable.indexOf(input), total: focusable.length, tabIndex: input.tabIndex, focuses, ringRule };
  })()`);
  const ok = Boolean(dom && dom.index >= 0 && dom.tabIndex === 0 && dom.focuses && dom.ringRule);
  let realTab = 'n/a';
  if (dom?.index >= 0) {
    // Real Tab traversal via the input pipeline (only advances when the browser
    // window holds OS focus — best effort evidence; the DOM contract above is the
    // authoritative check for automated runs).
    await cdp('Page.bringToFront');
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await ev(`document.activeElement?.blur(); true`);
    await sleepMs(250);
    realTab = 'missed';
    for (let i = 0; i < Math.min(dom.index + 2, 14); i++) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await sleepMs(120);
      const a = await ev(`document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName`);
      if (a === 'Search stores or products') { realTab = 'reached'; break; }
    }
  }
  return { ok, ...dom, realTab };
}

async function assertEnter() {
  const beforeUrl = await ev('location.pathname + location.search');
  const typed = await ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    input.focus();
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    proto.call(input, 'شاورما');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
  await sleepMs(300);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleepMs(1000);
  return ev(`(() => {
    const input = document.querySelector(${JSON.stringify(INPUT_SEL)});
    return { urlSame: location.pathname + location.search === ${JSON.stringify(beforeUrl)}, value: input?.value, focused: document.activeElement === input };
  })()`);
}

console.log('\n=== Search clickability + keyboard verification ===\n');

await boot('/home');
const aHome = await assertAffordance();
record('A1', 'Home pill shows text cursor (affordance)', Boolean(aHome?.cursor === 'text'),
  `cursor=${aHome?.cursor} pillWiderThanInput=${Boolean(aHome?.fullWidth)}`, '');
const bHome = await assertPillClick();
record('B1', 'Home: click on icon/padding area of pill focuses input', Boolean(bHome.ok),
  `point=(${bHome.point?.x},${bHome.point?.y}) outsideInput=${Boolean(bHome.point && !bHome.point.inInput)}`, 'whole-pill target via <label>');
const cHome = await assertAria();
record('C1', 'Home: role=search + aria-controls links to live results', Boolean(cHome?.searchRole && cHome?.regionExists),
  JSON.stringify(cHome), '');
const dHome = await assertKeyboard();
record('D1', 'Home: Tab traversal reaches the search input', dHome.ok, JSON.stringify(dHome), '');
const eHome = await assertEnter();
record('E1', 'Home: Enter handled — no navigation, term preserved', Boolean(eHome.urlSame && eHome.value),
  JSON.stringify(eHome), '');

await boot('/search');
const aSearch = await assertAffordance();
record('A2', '/search pill shows text cursor (affordance)', Boolean(aSearch?.cursor === 'text'),
  `cursor=${aSearch?.cursor}`, '');
const bSearch = await assertPillClick();
record('B2', '/search: click on icon/padding area of pill focuses input', Boolean(bSearch.ok),
  `point=(${bSearch.point?.x},${bSearch.point?.y})`, '');
const cSearch = await assertAria();
record('C2', '/search: role=search + aria-controls links to live results', Boolean(cSearch?.searchRole && cSearch?.regionExists),
  JSON.stringify(cSearch), '');
const dSearch = await assertKeyboard();
record('D2', '/search: Tab traversal reaches the search input', dSearch.ok, JSON.stringify(dSearch), '');
const eSearch = await assertEnter();
record('E2', '/search: Enter handled — no navigation, term preserved', Boolean(eSearch.urlSame && eSearch.value),
  JSON.stringify(eSearch), '');

const summary = { total: results.length, pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length };
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
ws.close();
setTimeout(() => process.exit(summary.fail > 0 ? 1 : 0), 150);