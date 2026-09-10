'use strict';

// Process supervision only: binaries are verified during the build, never downloaded here.
// Intended for Linux x64 after the verified routing bundle is prepared.
// Set SAMOU_API_DIR to the absolute packages/api directory before integration.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const configuredRoot = process.env.SAMOU_API_DIR || path.resolve(__dirname, '..');
  if (!configuredRoot || !path.isAbsolute(configuredRoot)) {
    throw new Error('SAMOU_API_DIR must be the absolute packages/api directory');
  }
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('The prepared routing bundle requires Linux x64');
  }
  const root = fs.realpathSync(configuredRoot);
  const binDir = path.join(root, '.routing', 'routing-bundle', 'bin');
  const binary = path.join(binDir, 'osrm-routed');
  const map = path.join(root, '.routing', 'routing-bundle', 'data', 'samou.osrm');
  const entry = path.join(root, 'dist', 'server.js');
  fs.accessSync(binary, fs.constants.X_OK);
  fs.accessSync(map + '.properties', fs.constants.R_OK);
  fs.accessSync(entry, fs.constants.R_OK);

  const children = new Set();
  let stopping = false;
  let restartTimer;
  let forceTimer;
  let retries = 0;
  const routeUrl = 'http://127.0.0.1:5000';

  function shutdown(code = 0, signal = 'SIGTERM') {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    clearTimeout(restartTimer);
    for (const child of children) child.kill(signal);
    if (children.size) {
      forceTimer = setTimeout(() => {
        for (const child of children) child.kill('SIGKILL');
      }, 8000);
      forceTimer.unref();
    }
  }

  function launch(executable, args, env, onFailure) {
    const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', shell: false });
    children.add(child);
    let reported = false;
    const report = (code, error) => {
      if (reported) return;
      reported = true;
      if (error) console.error('[supervisor]', error.message);
      if (!stopping) onFailure(code);
    };
    child.once('error', error => report(1, error));
    child.once('exit', (code, signal) => report(code === null ? 1 : code, signal ? new Error(path.basename(executable) + ' stopped by ' + signal) : undefined));
    child.once('close', () => {
      children.delete(child);
      if (stopping && children.size === 0) clearTimeout(forceTimer);
    });
    return child;
  }

  function startRouter() {
    if (stopping) return;
    launch(binary, [
      '--algorithm', 'mld', '--ip', '127.0.0.1', '--port', '5000',
      '--threads', '1', '--max-viaroute-size', '3', map,
    ], {
      ...process.env,
      LD_LIBRARY_PATH: binDir + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''),
    }, () => {
      if (retries >= 3) {
        console.error('[routing] Restart limit reached; API can continue without road geometry');
        return;
      }
      retries += 1;
      restartTimer = setTimeout(startRouter, retries * 2000);
    });
  }

  process.once('SIGTERM', () => shutdown());
  process.once('SIGINT', () => shutdown(0, 'SIGINT'));
  startRouter();
  let ready = false;
  for (let attempt = 0; attempt < 20 && !stopping; attempt += 1) {
    try {
      const response = await fetch(routeUrl + '/nearest/v1/driving/35.0661,31.3967', {
        signal: AbortSignal.timeout(1000),
      });
      const result = await response.json();
      if (response.ok && result.code === 'Ok') { ready = true; break; }
    } catch { /* Bounded startup grace period. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (stopping) return;
  console.log(ready ? '[routing] Ready on loopback' : '[routing] Not ready; starting API with route fallback');
  launch(process.execPath, [entry], { ...process.env, OSRM_BASE_URL: routeUrl }, code => shutdown(code));
}

module.exports = { main };
if (require.main === module) {
  main().catch(error => {
    console.error('[supervisor]', error.message);
    process.exitCode = 1;
  });
}

