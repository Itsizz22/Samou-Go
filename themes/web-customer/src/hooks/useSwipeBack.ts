/**
 * Swipe-to-go-back for mobile.
 *
 * A rightward horizontal drag anywhere on the screen walks history back one
 * step (`navigate(-1)`), the same gesture Android/iOS users expect. Vertical
 * scrolling is untouched (the gesture must be clearly horizontal), and touches
 * that start inside a horizontally-scrollable strip (category rails, product
 * galleries) are ignored so they scroll instead of navigating.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/** Minimum rightward travel (px) before the gesture counts as "back". */
const SWIPE_THRESHOLD = 72;

/** How strongly horizontal the gesture must be (|dx| > |dy| × factor). */
const HORIZONTAL_DOMINANCE = 1.5;

export function useSwipeBack<T extends HTMLElement>(): React.RefObject<T> {
  const navigate = useNavigate();
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let moving = false;

    // A swipe that begins on a horizontally-scrollable strip (or an element
    // that opted out with data-swipe-back="off") must let that strip scroll
    // instead of hijacking it as a back gesture.
    const startsOnScrollable = (target: EventTarget | null): boolean => {
      let node = target instanceof Element ? target : null;
      while (node && node !== el) {
        if (node.hasAttribute('data-swipe-back')) return node.getAttribute('data-swipe-back') !== 'true';
        const style = getComputedStyle(node);
        const overflowsX =
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 4;
        if (overflowsX) return true;
        node = node.parentElement;
      }
      return false;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || startsOnScrollable(event.target)) {
        tracking = false;
        return;
      }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
      moving = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!moving && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) moving = true;
      if (
        moving &&
        dx >= SWIPE_THRESHOLD &&
        Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE
      ) {
        event.preventDefault();
        tracking = false;
        moving = false;
        navigate(-1);
      }
    };

    const onTouchEnd = () => {
      tracking = false;
      moving = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [navigate]);

  return ref;
}
