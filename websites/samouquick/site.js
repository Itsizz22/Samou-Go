// Public-site enhancements. No app/API state or external requests.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const header = document.querySelector('.site-header');
let scrollFrame = 0;
function updateHeader() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    header?.classList.toggle('scrolled', scrollY > 40);
    scrollFrame = 0;
  });
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();
if ('IntersectionObserver' in window) {
  document.body.classList.add('motion-ready');
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('pending'); reveal.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  if (!motion.matches) document.querySelectorAll('.reveal').forEach(el => {
    el.classList.add('pending'); reveal.observe(el);
  });
  const phone = document.querySelector('.story-phone-wrap');
  const steps = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting && phone) phone.dataset.active = entry.target.dataset.step;
  }, { rootMargin: '-25% 0px -25% 0px', threshold: 0.15 });
  document.querySelectorAll('.story-step').forEach(el => steps.observe(el));
  const stickyDownload = document.querySelector('.mobile-download');
  const download = document.querySelector('#download');
  if (download && stickyDownload) new IntersectionObserver(entries => {
    stickyDownload.classList.toggle('is-hidden', entries[0].isIntersecting);
  }, { threshold: 0.1 }).observe(download);
}

const video = document.querySelector('.hero-video');
const toggle = document.querySelector('.motion-control');
const connection = navigator.connection;
let heroVisible = true;
let userPaused = false;
const conserve = () => motion.matches || connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
function syncVideo() {
  if (!video) return;
  if (conserve()) {
    video.pause(); video.removeAttribute('src'); video.load();
    if (toggle) toggle.hidden = true;
    return;
  }
  if (!video.getAttribute('src')) video.src = video.dataset.source;
  if (document.hidden || !heroVisible || userPaused) { video.pause(); return; }
  video.play().then(() => { if (toggle) toggle.hidden = false; }).catch(() => { if (toggle) toggle.hidden = true; });
}
if (video) {
  // Poster is the complete fallback when motion/data saving/autoplay prevents video.
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting; syncVideo();
  }, { threshold: 0.05 }).observe(video);
  video.addEventListener('error', () => { if (toggle) toggle.hidden = true; });
  toggle?.addEventListener('click', () => {
    userPaused = !userPaused;
    toggle.textContent = userPaused ? 'تشغيل الحركة' : 'إيقاف الحركة';
    toggle.setAttribute('aria-label', userPaused ? 'تشغيل حركة الخلفية' : 'إيقاف حركة الخلفية');
    syncVideo();
  });
  document.addEventListener('visibilitychange', syncVideo);
  motion.addEventListener('change', () => {
    if (motion.matches) document.querySelectorAll('.reveal.pending').forEach(el => el.classList.remove('pending'));
    syncVideo();
  });
  connection?.addEventListener('change', syncVideo);
  syncVideo();
}

// One fixed launch instant for every visitor; reloads never restart the timer.
const launchCard = document.querySelector("[data-launch-at]");
if (launchCard) {
  const deadline = Date.parse(launchCard.dataset.launchAt);
  let timer;
  const renderCountdown = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const values = {
      days: Math.floor(remaining / 86400),
      hours: Math.floor(remaining / 3600) % 24,
      minutes: Math.floor(remaining / 60) % 60,
      seconds: remaining % 60,
    };
    for (const [unit, value] of Object.entries(values))
      launchCard.querySelector(`[data-unit="${unit}"]`).textContent = String(
        value,
      ).padStart(2, "0");
    if (remaining === 0) {
      launchCard.querySelector(".launch-status").textContent =
        "وصلنا إلى موعد الإطلاق. تابع صفحاتنا لمعرفة آخر إعلان.";
      launchCard.querySelector("h3").textContent = "حان موعدنا";
      clearInterval(timer);
    }
    return remaining;
  };
  if (Number.isFinite(deadline) && renderCountdown() > 0)
    timer = setInterval(renderCountdown, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderCountdown();
  });
}
