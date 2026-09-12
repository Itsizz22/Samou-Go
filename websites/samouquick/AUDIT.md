# Public website audit — 12 September 2026

Scope: public landing page, Privacy, Terms and Delete Account only. No mobile application, API, order processing, database or admin changes.

## Before

Reviewed all four live pages at 390, 768 and 1440 pixels, their source, metadata, resource loading and animation behavior.

- Pages returned HTTP 200 and had no horizontal overflow or missing images.
- Hero copy was vague; the main visual described food rather than showing the application.
- Tablet inherited the long single-column phone layout.
- Category discovery was missing and the ordering journey was hidden in a slide.
- Desktop had no QR bridge to phone download.
- Supplied product screenshot was demo data; kept its disclosure rather than presenting invented merchants.
- Footer links existed; policy pages repeated homepage search/social descriptions.
- The fully-scrolled cold homepage transferred approximately 1.06 MB in the live audit.
- Existing supplied assets and TTF fonts could be smaller.

## Improvements

- Explicit service headline, requested Samou-wide coverage statement and local brand line.
- Real neighborhood-selection screenshot in a device frame; desktop text, CTA and phone share the first screen.
- Six accessible, server-rendered category disclosures backed by a local editable data file; no API dependency and no invented merchants.
- Five visible ordering steps and preserved benefits, supplied artwork and legal content.
- Genuine application captures with accurate demo labels; mobile screenshot scrolling and reduced-motion support.
- Direct APK CTA and metadata; independently decoded QR pointing to the stable download section.
- Preserved full footer, direct support/social links; added legal-page navigation and distinct metadata.
- Optimized WebP assets and WOFF2 fonts. Local fully-scrolled asset transfer approximately 0.37 MB, excluding APK. This is a development measurement, not a Lighthouse score or guaranteed network speed.
- Carousel no longer moves the whole page and autoplay is opt-in.

## Validation scope

Responsive checks at 320, 390, 768, 1024 and 1440 pixels: first-screen download CTA, category disclosure, carousel, download instructions, images and horizontal overflow. Automated axe WCAG A/AA checks on homepage and all legal pages; manually reviewed desktop/tablet/mobile captures. Strengthened small-label and footer-link contrast based on the scan. Hidden, lazy-loaded desktop QR images are excluded from missing-image assertions on phones.

QR decoded to `https://samouquick.com/#download`. Existing APK stays byte-for-byte unchanged. Security configuration remains unchanged. Automated accessibility checks supplement, but do not replace, human assistive-technology testing.
