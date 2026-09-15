const fs = require('node:fs');
const path = require('node:path');
// iOS only: npm's 1.2.26 manifest pins Capacitor 7's major range, while this
// application uses Capacitor 8. Keep the previously local repair reproducible.
const manifest = require.resolve('@capacitor-community/background-geolocation/package.json');
const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
if (pkg.version !== '1.2.26') throw new Error('Review the iOS SPM compatibility patch for the new geolocation version');
const file = path.join(path.dirname(manifest), 'Package.swift');
const source = fs.readFileSync(file, 'utf8');
const dependency = /(url:\s*"https:\/\/github.com\/ionic-team\/capacitor-swift-pm.git",\s*from:\s*)"([78]\.0\.0)"/g;
const matches = [...source.matchAll(dependency)];
if (matches.length !== 1) throw new Error('Unexpected geolocation SPM manifest; refusing an unverified patch');
const updated = source.replace(dependency, '$1"8.0.0"');
if (updated !== source) fs.writeFileSync(file, updated);
console.log('iOS geolocation SPM compatibility checked (Capacitor 8); Android unchanged');
