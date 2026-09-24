// Marketing-only projection of the anonymous public catalogue. No credentials.
const API = 'https://samou-go.onrender.com/api/v1/stores';
const labels = { RESTAURANT: 'مطاعم', CAFE: 'كافيهات', BAKERY_SWEETS: 'حلويات ومخابز', STORE: 'متاجر' };
function projectStore(row) {
  if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || typeof row.nameAr !== 'string' || !row.nameAr.trim()) return null;
  const store = { id: row.id, name: row.nameAr.slice(0,120), category: labels[row.storeType] || 'متاجر', logo: null, position: null };
  try {
    const url = new URL(row.logoUrl);
    if (url.origin === 'https://samou-go.onrender.com' && url.pathname.startsWith('/uploads/store/')) store.logo = url.href;
  } catch { /* An absent image gets a typographic fallback. */ }
  // A local map, never arbitrary coordinates or personal locations.
  if (typeof row.latitude === 'number' && typeof row.longitude === 'number' && row.latitude >= 31.34 && row.latitude <= 31.46 && row.longitude >= 35.01 && row.longitude <= 35.13) store.position = [row.longitude, row.latitude];
  return store;
}
async function fetchCatalogue(fetcher = fetch) {
  const stores = new Map();
  const signal = AbortSignal.timeout(8000);
  for (let page = 1; page <= 5; page++) {
    const res = await fetcher(`${API}?pageSize=100&page=${page}`, { headers: { Accept: 'application/json' }, redirect: 'error', signal });
    if (!res.ok) throw new Error('Catalogue unavailable');
    const body = await res.json();
    if (!Array.isArray(body.data?.items) || !Number.isInteger(body.data.totalPages)) throw new Error('Unexpected catalogue');
    for (const row of body.data.items) { const item = projectStore(row); if (item) stores.set(item.id, item); }
    if (page >= body.data.totalPages) break;
    if (page === 5) throw new Error('Catalogue exceeds page budget');
  }
  return { fetchedAt: new Date().toISOString(), stores: selectSample([...stores.values()]) };
}
function selectSample(stores, limit = 6) {
  // Round-robin categories: a small real selection that grows with the catalogue,
  // without suggesting it is an exhaustive list or publishing store counts.
  const groups = new Map();
  for (const store of stores) { const group = groups.get(store.category) || []; group.push(store); groups.set(store.category, group); }
  const sample = [];
  while (sample.length < limit && [...groups.values()].some(g=>g.length)) {
    for (const group of groups.values()) if (group.length && sample.length < limit) sample.push(group.shift());
  }
  return sample;
}
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function storeMarkup(store) {
  const e = escapeHtml;
  const image = store.localLogo || store.logo;
  return `<article class="store-card" data-category="${e(store.category)}" data-store="${e(store.id)}"><span class="store-logo">${image ? `<img src="${e(image)}" width="80" height="80" loading="lazy" decoding="async" alt=""/>` : `<span aria-hidden="true">${e(store.name.slice(0,1))}</span>`}</span><span class="store-copy"><strong>${e(store.name)}</strong><span>${e(store.category)}</span></span></article>`;
}
module.exports = { projectStore, fetchCatalogue, storeMarkup, escapeHtml, selectSample };
