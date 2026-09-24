# Catalogue-led visual polish

- Added two compressed catalogue images around the actual home screenshot: existing `outputs/ali-shawarma/baguette.png` and `outputs/coffee-time-upscaled/003.png`. These are existing catalogue illustrations, not newly photographed food. Combined WebP payload: 44,376 bytes.
- Added a short staggered hero entrance, descriptive captions for all three actual screens, a one-time illustrative delivery-line animation, and CTA arrow/press feedback.
- Kept the gallery vertically visible on phones. No swipe requirement, live-order claims, maps, internal deployment links, or open downloads.
- Motion respects reduced-motion and leaves content available without JavaScript. The delivery observer disconnects after first intersection.

## Verification

- Eight catalogue/privacy/download tests passed; JavaScript syntax and PostCSS parsing passed.
- Browser widths 320, 375, 390, 768, 1024, 1366 and 1440: no horizontal page overflow. Visually reviewed desktop hero, mobile hero, gallery captions and delivery stages.
- No broken loaded images or browser warning/error logs observed.
- Browser uses reduced-motion, so final static composition and accessibility fallback were visually checked; normal-motion timing was reviewed in code, not claimed as a recorded device test.
