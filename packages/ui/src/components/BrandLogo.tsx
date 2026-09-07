/**
 * BrandLogo — renders the official Samou Quick brand mark.
 *
 * Uses the canonical JPG source (`logo.jpg`) bundled by Vite at build time.
 * Use the `size` prop (default 40) to control the rendered diameter.
 */
import logoUrl from '../assets/logo.jpg';

interface BrandLogoProps {
  /** Diameter of the icon square (default 40). */
  size?: number;
  /** Extra class names on the root element. */
  className?: string;
}

export function BrandLogo({ size = 40, className }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <img
        src={logoUrl}
        alt="Samou Quick"
        width={size}
        height={size}
        style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
      />
    </span>
  );
}
