let origin: { x: number; y: number; time: number } | null = null;
let activeFlights = 0;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function trackCartOrigin(event: PointerEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest('button')) return;
  origin = { x: event.clientX, y: event.clientY, time: Date.now() };
}

/** Two transform-only axes with different easing produce a curved flight. */
export function flyToCart(name: string): void {
  if (
    reduceMotion() ||
    document.hidden ||
    !origin ||
    Date.now() - origin.time > 2000 ||
    activeFlights >= 2
  )
    return;
  const target = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/cart"]')).find(
    element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
    }
  );
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const point = origin;
  const dx = rect.x + rect.width / 2 - point.x;
  const dy = rect.y + rect.height / 2 - point.y;
  const outer = document.createElement('div');
  const badge = document.createElement('span');
  outer.className = 'sq-cart-flight';
  outer.setAttribute('aria-hidden', 'true');
  outer.style.direction = 'ltr';
  outer.style.insetInlineStart = `${point.x}px`;
  outer.style.top = `${point.y}px`;
  badge.textContent = name.slice(0, 2);
  outer.append(badge);
  document.body.append(outer);
  activeFlights++;
  const horizontal = outer.animate(
    [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${dx}px,0,0)` }],
    { duration: 600, easing: 'cubic-bezier(.3,0,.7,1)' }
  );
  badge.animate(
    [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      { transform: `translate3d(0,${dy}px,0) scale(.25)`, opacity: 0 },
    ],
    { duration: 600, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' }
  );
  void horizontal.finished
    .catch(() => {})
    .finally(() => {
      outer.remove();
      activeFlights--;
    });
}

/** Short bounded canvas burst. One canvas/frame loop, cleaned on navigation or visibility change. */
export function celebrateOrder(): () => void {
  if (reduceMotion() || document.hidden) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'sq-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
  const colors = [
    brand,
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-soft').trim(),
    'white',
  ];
  const particles = Array.from({ length: 36 }, (_, i) => ({
    angle: (i / 36) * Math.PI * 2,
    speed: 80 + Math.random() * 180,
    color: colors[i % colors.length] ?? brand,
  }));
  document.body.append(canvas);
  let frame = 0;
  const start = performance.now();
  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
  const draw = (now: number) => {
    const elapsed = (now - start) / 1000;
    if (elapsed >= 1.1 || reduceMotion()) {
      stop();
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1 - elapsed / 1.1;
    for (const p of particles) {
      const x = canvas.width / 2 + Math.cos(p.angle) * p.speed * elapsed;
      const y = canvas.height / 3 + Math.sin(p.angle) * p.speed * elapsed + 180 * elapsed * elapsed;
      context.fillStyle = p.color;
      context.fillRect(x, y, 5, 7);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return stop;
}
