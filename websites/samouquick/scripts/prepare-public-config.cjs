// A public browser token is delivered with the site, never committed to Git.
const fs = require('node:fs');
const path = require('node:path');
const publicToken = process.env.VITE_MAPBOX_ACCESS_TOKEN?.trim();
if (!publicToken || !/^pk\.[A-Za-z0-9._-]+$/.test(publicToken)) {
  throw new Error('Set the existing public VITE_MAPBOX_ACCESS_TOKEN in this website Vercel project.');
}
const content = path.resolve(__dirname, '../content');
fs.mkdirSync(content, { recursive: true });
fs.writeFileSync(path.join(content, 'map-config.json'), JSON.stringify({ publicToken }) + '\n');
console.log('Public map configuration prepared.');
