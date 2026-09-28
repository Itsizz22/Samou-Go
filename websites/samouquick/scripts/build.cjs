const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'content/launch.json'), 'utf8').replace(/^\uFEFF/, ''));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if (typeof config.prelaunch !== 'boolean' || !Number.isFinite(Date.parse(config.opensAt))) throw Error('Invalid launch configuration');
const pagePath = path.join(root, 'index.html');
let page = fs.readFileSync(pagePath, 'utf8');
const notice = config.prelaunch ? '<aside class="launch-notice" aria-label="موعد استقبال الطلبات"><p>' + escape(config.message) + '</p><strong><time datetime="' + escape(config.opensAt) + '">' + escape(config.label) + '</time></strong></aside>' : '';
if (!page.includes('<!-- LAUNCH:START -->')) throw Error('Missing launch slot');
page = page.replace(/<!-- LAUNCH:START -->[\s\S]*?<!-- LAUNCH:END -->/, '<!-- LAUNCH:START -->' + notice + '<!-- LAUNCH:END -->');
fs.writeFileSync(pagePath, page);
for (const [, ref] of page.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:webp|png|css|js|apk))[^"]*"/g)) {
  if (!fs.existsSync(path.join(root, ref))) throw Error('Missing asset: ' + ref);
}
const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw Error('Duplicate element ID');
for (const [, id] of page.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(id)) throw Error('Broken anchor: ' + id);
console.log('Website build passed: launch notice, local assets and navigation anchors.');
