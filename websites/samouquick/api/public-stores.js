const { fetchCatalogue } = require('../lib/catalogue.cjs');
const snapshot = require('../content/stores.json');
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).json({error:'Method not allowed'}); }
  try {
    const data = await fetchCatalogue();
    for (const store of data.stores) {
      const saved = snapshot.stores.find(s => s.id === store.id && s.logo === store.logo);
      if (saved?.localLogo) store.localLogo = saved.localLogo;
    }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Catalogue temporarily unavailable' });
  }
};
