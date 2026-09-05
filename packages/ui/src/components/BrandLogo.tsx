/**
 * BrandLogo — inline SVG representation of the Samou Quick identity.
 *
 * The "S + Lightning" mark renders at any size via viewBox. Use the `size`
 * prop (default 40) to control the rendered diameter.
 */
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
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Samou Quick"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="bl-emeraldBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#065F46" />
            <stop offset="50%" stopColor="#044E37" />
            <stop offset="100%" stopColor="#022C22" />
          </linearGradient>
          <linearGradient id="bl-boltGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="45%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#EAB308" />
          </linearGradient>
          <filter id="bl-depth" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#011F17" floodOpacity="0.65" />
          </filter>
        </defs>
        <rect width="512" height="512" rx="128" fill="url(#bl-emeraldBg)" stroke="#10B981" strokeWidth="4" />
        <g filter="url(#bl-depth)">
          <text x="190" y="295" textAnchor="middle" fill="#FFF" fontFamily="system-ui,-apple-system,sans-serif" fontSize="185" fontStyle="italic" fontWeight="900">S</text>
          <polygon points="325,128 275,240 320,240 252,382 360,215 315,215" fill="url(#bl-boltGold)" stroke="#FEF08A" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="375" cy="180" r="13" fill="#FEF08A" />
          <circle cx="390" cy="295" r="16" fill="#FACC15" />
          <circle cx="240" cy="390" r="10" fill="#34D399" />
        </g>
        <text x="256" y="442" textAnchor="middle" fill="#A7F3D0" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="700" letterSpacing="5">SAMOU QUICK</text>
      </svg>
    </span>
  );
}
