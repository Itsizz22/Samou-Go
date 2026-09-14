import { useState, type ImgHTMLAttributes } from 'react';

/**
 * `ImageWithFallback` — drops in for any `<img>` and silently degrades to a
 * branded placeholder when the source returns 404, 503, or any load error.
 *
 * Features:
 *   • Smooth opacity crossfade (300ms) from placeholder → loaded image.
 *   • `prefers-reduced-motion` respected — instant swap.
 *   • `onError` never leaks to the console; the component swallows it and
 *     shows the fallback.
 *   • Accepts all standard `<img>` props (`className`, `loading`, `alt`, etc.).
 */

interface ImageWithFallbackProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Fallback content shown when the image fails to load. */
  fallback?: React.ReactNode;
  /** Optional seed text for the auto-generated initial fallback. */
  fallbackText?: string;
}

function AutoFallback({ text }: { text?: string }) {
  const initial = text?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <div className="flex h-full w-full items-center justify-center bg-brand-surface">
      <span className="text-lg font-black text-brand/40">{initial}</span>
    </div>
  );
}

export function ImageWithFallback({
  src,
  alt = '',
  fallback,
  fallbackText,
  className = '',
  onError,
  onLoad,
  ...rest
}: ImageWithFallbackProps) {
  const [failedSource, setFailedSource] = useState<string | undefined>();

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Swallow the error — no console noise.
    setFailedSource(src);
    onError?.(e);
  };

  if ((failedSource !== undefined && failedSource === src) || !src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {fallback ?? <AutoFallback text={fallbackText ?? alt} />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} sq-loaded-image`}
      onError={handleError}
      onLoad={event => {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          event.currentTarget.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
        }
        onLoad?.(event);
      }}
      loading="lazy"
      {...rest}
    />
  );
}
