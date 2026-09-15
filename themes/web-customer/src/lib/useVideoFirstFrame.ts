import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep the native video surface hidden until its first decoded frame is presented. */
export function useVideoFirstFrame() {
  const video = useRef<HTMLVideoElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const cancel = useRef<(() => void) | undefined>(undefined);
  const revealVideo = useCallback(() => {
    const element = video.current;
    if (!element) return;
    cancel.current?.();
    const reveal = () => {
      cancel.current = undefined;
      if (video.current === element) setFrameReady(true);
    };
    if (typeof element.requestVideoFrameCallback === 'function') {
      const id = element.requestVideoFrameCallback(reveal);
      cancel.current = () => element.cancelVideoFrameCallback(id);
    } else {
      let id = requestAnimationFrame(() => { id = requestAnimationFrame(reveal); });
      cancel.current = () => cancelAnimationFrame(id);
    }
  }, []);
  useEffect(() => () => cancel.current?.(), []);
  return { video, frameReady, revealVideo };
}
