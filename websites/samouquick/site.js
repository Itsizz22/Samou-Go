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
// Motion is progressive enhancement: content stays visible if JS or animation fails.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const animatedElements = new WeakSet();
const activeAnimations = new Set();
function enter(element, delay = 0) {
  if (reducedMotion.matches || !element.animate || animatedElements.has(element)) return;
  animatedElements.add(element);
  const animation = element.animate([
    { opacity: .35, translate: '0 16px' },
    { opacity: 1, translate: '0 0' }
  ], { duration: 420, delay, easing: 'cubic-bezier(.16,1,.3,1)' });
  activeAnimations.add(animation);
  animation.finished.catch(() => {}).finally(() => activeAnimations.delete(animation));
}
const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting);
  visible.forEach((entry, index) => {
    enter(entry.target, Math.min(index * 85, 340));
    revealObserver.unobserve(entry.target);
  });
}, { threshold: .12 }) : null;
function revealOnScroll(root = document) {
  if (!revealObserver || reducedMotion.matches) return;
  root.querySelectorAll('.store-card, .journey-screens .phone, .section-heading, .closing-action, .stories-grid figure, .pickup-panel, .join-card')
    .forEach(element => revealObserver.observe(element));
}
revealOnScroll();
document.querySelectorAll('.hero-copy > *').forEach((element, index) => enter(element, index * 110));

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    activeAnimations.forEach(animation => animation.cancel());

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
let filterAnimations = [];
function reserveGridSpace() {
  const cards = [...grid.querySelectorAll('.store-card')];
  cards.forEach(card => { card.hidden = false; });
  grid.style.minHeight = '';
  grid.style.minHeight = grid.getBoundingClientRect().height + 'px';
  applyFilter();
}
function applyFilter(animate = false) {
  filterAnimations.forEach(animation => animation.cancel());
  filterAnimations = [];
  for (const card of grid.querySelectorAll('.store-card')) card.hidden = selectedCategory !== 'all' && card.dataset.category !== selectedCategory;
  if (animate && !reducedMotion.matches) {
    grid.querySelectorAll('.store-card:not([hidden])').forEach((card, index) => {
      if (!card.animate) return;
      const animation = card.animate([{opacity:.4,translate:'0 6px'},{opacity:1,translate:'0 0'}],{duration:200,delay:index*25,easing:'ease-out'});
      filterAnimations.push(animation);
      activeAnimations.add(animation);
      animation.finished.catch(() => {}).finally(() => activeAnimations.delete(animation));
    });
  }
  for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.filter === selectedCategory));
}
filters.hidden = false;
filters.addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button) { selectedCategory = button.dataset.filter; applyFilter(true); } });
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
  reserveGridSpace();
  catalogueStatus.textContent = !catalogue.length ? 'لا توجد متاجر متاحة للعرض الآن. جرّب لاحقًا أو تواصل مع الدعم.' : snapshot ? 'عينة محفوظة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح الآن.' : 'عينة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح والأسعار الحالية.';
}
async function readJSON(url) { const res=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('Unavailable');return res.json(); }
// Live updates preserve a crawlable, genuine snapshot when a connection fails.
const catalogueReady = (async()=> {
  try { const data = await readJSON('/api/public-stores'); if(!Array.isArray(data.stores))throw Error('Invalid response'); renderCatalogue(data,false); }
  catch { try { renderCatalogue(await readJSON('/content/stores.json'),true); } catch { catalogueStatus.textContent='تعذر تحديث المتاجر؛ القائمة محفوظة من الكتالوج العام.'; } }
})();
// No analytics SDK or tracking cookies are introduced.

reserveGridSpace();
if ('ResizeObserver' in window) {
  let previousWidth = grid.clientWidth;
  new ResizeObserver(() => {
    if (grid.clientWidth !== previousWidth) {
      previousWidth = grid.clientWidth;
      reserveGridSpace();
    }
  }).observe(grid);
}
document.fonts?.ready.then(reserveGridSpace);
