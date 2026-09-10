import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';

/** Loop uses boundary copies, so wrapping never sweeps across every slide. */
export function useShowcaseCarousel(count: number, intervalMs = 3500) {
  const [position, setPosition] = useState(count > 1 ? 1 : 0);
  const [instant, setInstant] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const pointerInput = useRef(false);
  const start = useRef<{ x: number; y: number; width: number; horizontal: boolean } | null>(null);
  const suppressClick = useRef(false);
  const active = count > 1 ? ((position - 1 + count) % count) : 0;
  const paused = hovered || focused || stopped || drag !== null || reducedMotion || !visible;
  const setIndex = (index: number) => { setInstant(false); setPosition(count > 1 ? Math.min(count - 1, Math.max(0, index)) + 1 : 0); };
  const step = (delta: number) => { setInstant(false); setPosition(current => count > 1 ? Math.max(0, Math.min(count + 1, current + delta)) : 0); };
  const settle = () => {
    if (count > 1 && (position === 0 || position === count + 1)) {
      setInstant(true);
      setPosition(position === 0 ? count : 1);
    }
  };
  useEffect(() => { setInstant(true); setPosition(count > 1 ? 1 : 0); }, [count]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion(); updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { media.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);
  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setTimeout(() => { setInstant(false); setPosition(current => Math.min(count + 1, current + 1)); }, intervalMs);
    return () => clearTimeout(timer);
  }, [paused, count, intervalMs, position]);
  useEffect(() => {
    if (position !== 0 && position !== count + 1) return;
    const timer = setTimeout(settle, reducedMotion ? 0 : 500);
    return () => clearTimeout(timer);
  }, [position, count, reducedMotion]);
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const gesture = start.current;
    start.current = null;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    if (gesture.horizontal) {
      suppressClick.current = true;
      if (!cancel && Math.abs(dx) > Math.min(70, gesture.width * 0.18)) step(dx < 0 ? 1 : -1);
    }
    setInstant(false); setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    active, position, setIndex, stopped, setStopped, step,
    trackStyle: { transform: `translate3d(calc(${-position * 100}% + ${drag ?? 0}px), 0, 0)`, transition: drag !== null || instant || reducedMotion ? 'none' : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)', willChange: 'transform' } satisfies CSSProperties,
    onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => { if (event.target === event.currentTarget && event.propertyName === 'transform') settle(); },
    bindings: {
      onPointerEnter: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType === 'mouse') setHovered(true); },
      onPointerLeave: (event: PointerEvent<HTMLDivElement>) => { if (event.pointerType === 'mouse') setHovered(false); },
      onKeyDownCapture: () => { pointerInput.current = false; setFocused(true); },
      onFocusCapture: () => { if (!pointerInput.current) setFocused(true); },
      onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        pointerInput.current = true; setFocused(false); suppressClick.current = false;
        if (count < 2 || event.button !== 0 || !event.isPrimary || (event.target instanceof Element && event.target.closest('button,input'))) return;
        setInstant(false);
        start.current = { x: event.clientX, y: event.clientY, width: event.currentTarget.clientWidth, horizontal: false };
        setDrag(0);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const gesture = start.current; if (!gesture) return;
        const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y;
        if (!gesture.horizontal && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { start.current = null; setDrag(null); return; }
        if (gesture.horizontal || (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy))) {
          gesture.horizontal = true; suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag(Math.max(-gesture.width, Math.min(gesture.width, dx)));
        }
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } },
      onDragStart: (event: React.DragEvent<HTMLDivElement>) => event.preventDefault(),
    },
  };
}
