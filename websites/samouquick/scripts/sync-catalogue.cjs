const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchCatalogue, storeMarkup, escapeHtml } = require('../lib/catalogue.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const catalogue = await fetchCatalogue();
  // Public store logos are resized once, not on every visitor request.
  const sharp = require('sharp');
  await fs.mkdir(path.join(root,'assets/stores'),{recursive:true});
  for (const store of catalogue.stores) {
    if (!store.logo) continue;
    try {
      const response = await fetch(store.logo, {redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if(bytes.length > 8e6) continue;
      await sharp(bytes).resize(160,160,{fit:'inside',withoutEnlargement:true}).webp({quality:80}).toFile(path.join(root,'assets/stores',`${store.id}.webp`));
      store.localLogo = `/assets/stores/${store.id}.webp`;
    } catch { /* Keep the approved public image URL when resize fails. */ }
  }
  await fs.writeFile(path.join(root,'content/stores.json'), JSON.stringify(catalogue,null,2)+'\n');
  let html=await fs.readFile(path.join(root,'index.html'),'utf8');
  html=html.replace(/<!-- STORES:START -->[\s\S]*?<!-- STORES:END -->/,`<!-- STORES:START -->\n${catalogue.stores.map(storeMarkup).join('\n')}\n<!-- STORES:END -->`);
  const categories=[...new Set(catalogue.stores.map(s=>s.category))];
  html=html.replace(/<!-- FILTERS:START -->[\s\S]*?<!-- FILTERS:END -->/,`<!-- FILTERS:START --><button type="button" data-filter="all" aria-pressed="true">الكل</button>${categories.map(c=>`<button type="button" data-filter="${escapeHtml(c)}" aria-pressed="false">${escapeHtml(c)}</button>`).join('')}<!-- FILTERS:END -->`);
  await fs.writeFile(path.join(root,'index.html'),html);
  console.log(`Public catalogue synced: ${catalogue.stores.length} stores; ${catalogue.stores.filter(s=>s.position).length} public map locations.`);
})().catch(e=>{console.error(e.message);process.exitCode=1});
