// Public marketing only. No auth, ordering, tracking or application state.
document.documentElement.classList.add('js');
const nav = document.querySelector('#main-nav');
const menu = document.querySelector('.menu-toggle');
if (menu && nav) {
  menu.hidden = false;
  const closeMenu = () => { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menu.focus(); } });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
}
const sticky = document.querySelector('.mobile-download');
if (sticky && 'IntersectionObserver' in window) {
  let atDownload = false, atFooter = false;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target.id === 'download') atDownload = entry.isIntersecting;
      else atFooter = entry.isIntersecting;
    }
    sticky.hidden = atDownload || atFooter;
  }, { threshold: 0, rootMargin: '0px 0px 100px 0px' });
  observer.observe(document.querySelector('#download'));
  observer.observe(document.querySelector('.site-footer'));
  sticky.hidden = false;
}
// Reveal below-the-fold content once; never hide content without observer support.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    entry.target.classList.remove('reveal-pending');
    revealObserver.unobserve(entry.target);
  }
}, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }) : null;
function revealOnScroll(root = document) {
  if (!revealObserver || reducedMotion.matches) return;
  const elements = root.querySelectorAll('.store-card, .screen-gallery figure, .section-heading, .tracking-demo, .closing-action');
  for (const element of elements) {
    if (element.getBoundingClientRect().top < window.innerHeight) continue;
    element.classList.add('scroll-reveal', 'reveal-pending');
    revealObserver.observe(element);
  }
}
revealOnScroll();
// An illustrative journey, played once. It never represents a live order.
const journeyDemo = document.querySelector('.tracking-demo');
const journeyObserver = journeyDemo && !reducedMotion.matches && 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      journeyDemo.classList.add('journey-played');
      journeyObserver.disconnect();
    }
  }, { threshold: 0.35 }) : null;
journeyObserver?.observe(journeyDemo);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    journeyObserver?.disconnect();
    revealObserver?.disconnect();
    document.querySelectorAll('.reveal-pending').forEach(element => element.classList.remove('reveal-pending'));
  }
});
document.addEventListener('focusin', event => {
  const section = event.target.closest('.reveal-pending');
  if (section) { section.classList.remove('reveal-pending'); revealObserver?.unobserve(section); }
});

const grid = document.querySelector('#store-grid');
const filters = document.querySelector('.category-strip');
const catalogueStatus = document.querySelector('#catalogue-status');
let selectedCategory = 'all';
let catalogue;
function applyFilter() {
  for (const card of grid.querySelectorAll('.store-card')) card.hidden = selectedCategory !== 'all' && card.dataset.category !== selectedCategory;
  for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.filter === selectedCategory));
}
filters.hidden = false;
filters.addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { selectedCategory = button.dataset.filter; applyFilter(); } });
function safeStore(s) {
  return s && /^[a-zA-Z0-9_-]{1,100}$/.test(s.id) && typeof s.name === 'string' && typeof s.category === 'string';
}
function renderCatalogue(data, snapshot) {
  catalogue = data.stores.filter(safeStore).slice(0, 6);
  const fragment = document.createDocumentFragment();
  for (const s of catalogue) {
    const a = document.createElement('article'); a.className = 'store-card'; a.dataset.category = s.category; a.dataset.store = s.id;
    const logo = document.createElement('span'); logo.className = 'store-logo'; logo.textContent = s.name.slice(0,1);
    // The server projection allowlists this origin; never trust arbitrary URLs.
    const imagePath = /^\/assets\/stores\/[\w-]+\.webp$/.test(s.localLogo || '') ? s.localLogo : s.logo;
    if (imagePath && (imagePath.startsWith('/assets/stores/') || imagePath.startsWith('https://samou-go.onrender.com/uploads/store/'))) {
      const img = new Image(80, 80); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = imagePath;
      img.addEventListener('error', () => { logo.textContent = s.name.slice(0,1); }, { once:true }); logo.replaceChildren(img);
    }
    const copy = document.createElement('span'); copy.className='store-copy';
    const title = document.createElement('strong'); title.textContent=s.name;
    const category = document.createElement('span'); category.textContent=s.category; copy.append(title,category);
    a.append(logo,copy); fragment.append(a);
  }
  grid.replaceChildren(fragment);
  revealOnScroll(grid);
  const cats = ['all',...new Set(catalogue.map(s=>s.category))];
  if(!cats.includes(selectedCategory)) selectedCategory='all';
  filters.replaceChildren(...cats.map(c => { const b=document.createElement('button'); b.type='button';b.dataset.filter=c;b.textContent=c==='all'?'الكل':c;return b; }));
  filters.hidden=catalogue.length===0;
  applyFilter();
  catalogueStatus.textContent = !catalogue.length ? 'لا توجد متاجر متاحة للعرض الآن. جرّب لاحقًا أو تواصل مع الدعم.' : snapshot ? 'عينة محفوظة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح الآن.' : 'عينة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح والأسعار الحالية.';
}
async function readJSON(url) { const res=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('Unavailable');return res.json(); }
// Live updates preserve a crawlable, genuine snapshot when a connection fails.
const catalogueReady = (async()=> {
  try { const data = await readJSON('/api/public-stores'); if(!Array.isArray(data.stores))throw Error('Invalid response'); renderCatalogue(data,false); }
  catch { try { renderCatalogue(await readJSON('/content/stores.json'),true); } catch { catalogueStatus.textContent='تعذر تحديث المتاجر؛ القائمة محفوظة من الكتالوج العام.'; } }
})();
// No analytics SDK or tracking cookies are introduced.
