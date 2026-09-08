import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// These themes use literal paths plus the documented /(.*) catch-all.
function routePattern(source) {
  if (source.includes(':')) throw new Error(`Unsupported route parameter: ${source}`);
  return '^' + source.split('(.*)').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)') + '$';
}

export function buildOutputConfig(config) {
  return {
    version: 3,
    routes: [
      ...(config.headers ?? []).map((rule) => ({
        src: routePattern(rule.source),
        headers: Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])),
        continue: true,
      })),
      // Serve actual icons, service workers and chunks before the SPA fallback.
      { handle: 'filesystem' },
      ...(config.rewrites ?? []).map((rule) => ({ src: routePattern(rule.source), dest: rule.destination })),
    ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const theme = process.argv[2];
  if (!theme || !/^web-[a-z-]+$/.test(theme)) throw new Error('Expected a web-* theme name');
  const config = JSON.parse(await readFile(path.join('themes', theme, 'vercel.json'), 'utf8'));
  await writeFile(process.argv[3] ?? '.vercel/output/config.json', JSON.stringify(buildOutputConfig(config), null, 2) + '\n');
}
