'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'supervise-routing.cjs'), 'utf8');
function fixture() {
  const children = [];
  const timers = [];
  const proc = new EventEmitter();
  Object.assign(proc, { env: { SAMOU_API_DIR: path.resolve(__dirname, '..') }, platform: 'linux', arch: 'x64', execPath: 'node', exitCode: 0 });
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    Object.assign(child, { file, args, options, signals: [], kill(signal) { this.signals.push(signal); return true; } });
    children.push(child);
    return child;
  };
  const exports = { exports: {} };
  const localRequire = name => {
    if (name === 'node:child_process') return { spawn };
    if (name === 'node:fs') return { realpathSync: x => x, accessSync() {}, constants: fs.constants };
    return require(name);
  };
  const context = { module: exports, require: localRequire, __dirname, process: proc, console: { log() {}, error() {} }, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ code: 'Ok' }) }),
    setTimeout: (fn, ms) => { const timer = { fn, ms, cleared: false, unref() {} }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cleared = true; },
  };
  vm.runInNewContext(source, context);
  return { main: exports.exports.main, children, timers, proc };
}
test('starts loopback-only route engine and passes private URL to API', async () => {
  const f = fixture(); await f.main();
  assert.equal(f.children.length, 2);
  assert.ok(f.children[0].args.includes('127.0.0.1'));
  assert.equal(f.children[0].options.shell, false);
  assert.equal(f.children[1].options.env.OSRM_BASE_URL, 'http://127.0.0.1:5000');
});
test('API exit stops only supervised children and preserves failure status', async () => {
  const f = fixture(); await f.main(); f.children[1].emit('exit', 7);
  assert.equal(f.proc.exitCode, 7);
  assert.equal(f.children[0].signals[0], 'SIGTERM');
  assert.equal(f.children[1].signals[0], 'SIGTERM');
});
test('router crashes have bounded retries without stopping API', async () => {
  const f = fixture(); await f.main();
  let router = f.children[0];
  for (let i = 1; i <= 3; i++) {
    router.emit('exit', 1); router.emit('close');
    const timer = f.timers.at(-1); assert.equal(timer.ms, i * 2000); timer.fn(); router = f.children.at(-1);
  }
  router.emit('exit', 1); router.emit('close');
  assert.equal(f.timers.length, 3); assert.equal(f.children[1].signals.length, 0);
});
test('termination cancels pending restart', async () => {
  const f = fixture(); await f.main(); f.children[0].emit('exit', 1); f.proc.emit('SIGTERM');
  assert.equal(f.timers[0].cleared, true);
  const count = f.children.length; f.timers[0].fn(); assert.equal(f.children.length, count);
});
