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
function externalLink(href, text) { const a = document.createElement('a'); a.href = href; a.textContent = text; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function safeStore(s) {
  return s && /^[a-zA-Z0-9_-]{1,100}$/.test(s.id) && typeof s.name === 'string' && typeof s.category === 'string' && s.href === `https://samou-go-customer.vercel.app/stores/${s.id}`;
}
function renderCatalogue(data, snapshot) {
  catalogue = data.stores.filter(safeStore).slice(0, 6);
  const fragment = document.createDocumentFragment();
  for (const s of catalogue) {
    const a = externalLink(s.href, ''); a.className = 'store-card'; a.dataset.category = s.category; a.dataset.store = s.id;
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
    const arrow = document.createElement('span'); arrow.className='store-arrow'; arrow.textContent='↗'; arrow.setAttribute('aria-hidden','true');
    const hint = document.createElement('span'); hint.className='sr-only'; hint.textContent=' — استعرض المتجر في التطبيق، يفتح في نافذة جديدة';
    a.append(logo,copy,arrow,hint); fragment.append(a);
  }
  grid.replaceChildren(fragment);
  const cats = ['all',...new Set(catalogue.map(s=>s.category))];
  if(!cats.includes(selectedCategory)) selectedCategory='all';
  filters.replaceChildren(...cats.map(c => { const b=document.createElement('button'); b.type='button';b.dataset.filter=c;b.textContent=c==='all'?'الكل':c;return b; }));
  filters.hidden=catalogue.length===0;
  applyFilter();
  catalogueStatus.textContent = !catalogue.length ? 'لا توجد متاجر متاحة للعرض الآن. جرّب لاحقًا أو تواصل مع الدعم.' : snapshot ? 'عينة محفوظة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح الآن.' : 'عينة من الكتالوج العام؛ راجع التطبيق لمعرفة المتاح والأسعار الحالية.';
  const list=document.querySelector('#map-store-list'); list.replaceChildren();
  for(const s of locatedStores()) { const li=document.createElement('li');li.append(externalLink(s.href,s.name));list.append(li); }
  if(!list.children.length){const li=document.createElement('li');li.textContent='لا تتوفر مواقع مسجلة لهذه العينة حاليًا.';list.append(li);}
}
function locatedStores() { return (catalogue || []).filter(s=>Array.isArray(s.position) && s.position.length===2 && s.position.every(Number.isFinite) && s.position[0]>=35.01 && s.position[0]<=35.13 && s.position[1]>=31.34 && s.position[1]<=31.46); }
async function readJSON(url) { const res=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('Unavailable');return res.json(); }
// Live updates preserve a crawlable, genuine snapshot when a connection fails.
const catalogueReady = (async()=> {
  try { const data = await readJSON('/api/public-stores'); if(!Array.isArray(data.stores))throw Error('Invalid response'); renderCatalogue(data,false); }
  catch { try { renderCatalogue(await readJSON('/content/stores.json'),true); } catch { catalogueStatus.textContent='تعذر تحديث المتاجر؛ القائمة محفوظة من الكتالوج العام.'; } }
})();
const loadMap = document.querySelector('#load-map');
const mapStatus = document.querySelector('#map-status');
const mapPlaceholder = document.querySelector('.map-placeholder');
let map;
function loadMapLibrary() {
  if(window.mapboxgl)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const css=document.createElement('link');css.rel='stylesheet';css.href='https://api.mapbox.com/mapbox-gl-js/v3.30.0/mapbox-gl.css';document.head.append(css);
    const script=document.createElement('script');script.src='https://api.mapbox.com/mapbox-gl-js/v3.30.0/mapbox-gl.js';script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();css.remove();reject(Error('Library unavailable'));};document.head.append(script);
  });
}
loadMap.addEventListener('click',async()=>{
  loadMap.disabled=true;mapStatus.textContent='جارٍ تحميل الخريطة…';
  try {
    await catalogueReady;
    const stores=locatedStores();if(!stores.length)throw Error('No public positions');
    const config=await readJSON('/content/map-config.json');if(!/^pk\./.test(config.publicToken || ''))throw Error('No public token');
    await loadMapLibrary();
    if(!window.mapboxgl.supported())throw Error('WebGL unavailable');
    const mb=window.mapboxgl;
    if(mb.getRTLTextPluginStatus()==='unavailable')mb.setRTLTextPlugin('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js',undefined,true);
    const host=document.querySelector('#store-map');host.replaceChildren();
    map=new mb.Map({container:host,accessToken:config.publicToken,style:'mapbox://styles/mapbox/streets-v12',center:stores[0].position,zoom:14,attributionControl:false,scrollZoom:false,cooperativeGestures:true,locale:{'NavigationControl.ZoomIn':'تكبير','NavigationControl.ZoomOut':'تصغير','Map.Title':'خريطة متاجر السموع','Popup.Close':'إغلاق معلومات المتجر','AttributionControl.ToggleAttribution':'إظهار مصادر الخريطة','TouchPanBlocker.Message':'استخدم إصبعين لتحريك الخريطة'}});
    map.addControl(new mb.AttributionControl({compact:true}),'bottom-right');
    map.addControl(new mb.NavigationControl({showCompass:false}),'top-left');
    const bounds=new mb.LngLatBounds();
    let activePopup;
    for(const s of stores){
      bounds.extend(s.position);
      const pin=document.createElement('button');pin.type='button';pin.className='store-pin';pin.textContent=s.name.slice(0,1);pin.setAttribute('aria-label',s.name);
      const content=document.createElement('div');const title=document.createElement('strong');title.textContent=s.name;content.append(title,externalLink(s.href,'استعرض المتجر ↗'));
      const popup=new mb.Popup({offset:26,focusAfterOpen:true}).setDOMContent(content);
      popup.on('open',()=>{
        if(activePopup && activePopup !== popup)activePopup.remove();activePopup=popup;
        popup.getElement()?.querySelector('.mapboxgl-popup-close-button')?.setAttribute('aria-label','إغلاق معلومات المتجر');
      });
      new mb.Marker({element:pin,anchor:'center'}).setLngLat(s.position).setPopup(popup).addTo(map);
    }
    map.fitBounds(bounds,{padding:55,maxZoom:15,duration:0});
    map.on('load',()=>{
      mapStatus.textContent='مواقع المتاجر المسجلة؛ اضغط علامة المتجر لاستعراضه.';
    });
    map.on('error',()=>{mapStatus.textContent='تعذر تحميل جزء من الخريطة. أسماء المتاجر وروابطها متاحة بجانبها.';});
  } catch {
    map?.remove(); map = undefined;
    document.querySelector('#store-map').replaceChildren(mapPlaceholder);
    mapStatus.textContent='تعذر عرض الخريطة الآن. يمكنك تصفح المتاجر وروابطها أو المحاولة مجددًا.';loadMap.disabled=false;
  }
});
// No analytics SDK or tracking cookies are introduced.
