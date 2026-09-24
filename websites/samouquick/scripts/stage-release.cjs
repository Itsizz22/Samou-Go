// Prepare only the public marketing project for its existing Vercel root directory.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = process.argv[2] && path.resolve(process.argv[2]);
if (!target || target === root || root.startsWith(target + path.sep) || target.startsWith(root + path.sep)) {
  throw new Error('Provide an isolated staging directory outside the website source.');
}
if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error('Use a new empty staging directory.');
const dest = path.join(target, 'websites/samouquick');
fs.mkdirSync(dest, { recursive: true });
fs.mkdirSync(path.join(target, '.vercel'), { recursive: true });
fs.copyFileSync(path.join(root, '.vercel/project.json'), path.join(target, '.vercel/project.json'));
for (const file of ['index.html','marketing.css','fonts.css','site.js','privacy.html','terms.html','delete-account.html','support.html','style.css','refinements.css','design-finish.css','vercel.json','robots.txt','sitemap.xml']) {
  fs.copyFileSync(path.join(root,file),path.join(dest,file));
}
for (const dir of ['api','lib','content']) fs.cpSync(path.join(root,dir),path.join(dest,dir),{recursive:true,filter:source=>path.basename(source)!=='map-config.json'});
fs.mkdirSync(path.join(dest,'scripts'),{recursive:true});
fs.copyFileSync(path.join(root,'scripts/prepare-public-config.cjs'),path.join(dest,'scripts/prepare-public-config.cjs'));
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
for (const file of fs.readdirSync(path.join(root,'assets'))) {
  if (/\.(webp|woff2|svg|txt)$/.test(file)) fs.copyFileSync(path.join(root,'assets',file),path.join(dest,'assets',file));
}
fs.cpSync(path.join(root,'assets/stores'),path.join(dest,'assets/stores'),{recursive:true});
console.log('Public marketing staging ready. Downloads and private environment/signing files excluded.');
