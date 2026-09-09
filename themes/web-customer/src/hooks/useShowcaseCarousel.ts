import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';

/** Shared banner/product interaction: physical leftward advance in either language. */
export function useShowcaseCarousel(count: number, intervalMs = 3500) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const active = Math.min(index, Math.max(0, count - 1));
  const paused = hovered || focused || touching || stopped || drag !== null || reducedMotion || !visible;
  const step = (delta: number) =>
    setIndex(current => (count ? (current + delta + count) % count : 0));

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [paused, count, intervalMs, active]);

  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    setTouching(false);
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (!cancel && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
      suppressClick.current = true;
    }
    start.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    active,
    setIndex,
    stopped,
    setStopped,
    step,
    trackStyle: {
      transform: `translateX(calc(${-active * 100}% + ${drag ?? 0}px))`,
      transition: drag !== null || reducedMotion ? 'none' : 'transform 450ms ease-out',
    } satisfies CSSProperties,
    bindings: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocusCapture: () => setFocused(true),
      onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'touch') setTouching(true);
        suppressClick.current = false;
        if (
          event.button !== 0 ||
          (event.target instanceof Element && event.target.closest('button,input'))
        )
          return;
        start.current = { x: event.clientX, y: event.clientY };
        setDrag(0);

      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag(dx);
        }
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
      onDragStart: (event: React.DragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
