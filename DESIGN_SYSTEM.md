# Design system

Current implementation is the source of truth. This reference replaces the obsolete design plan; it does not override theme tokens or shared domain rules.

## 1. Scope
Seven React themes share primitives in `packages/ui`. The customer theme also contains the native app's captain and store-manager screens.

## 2. Technology
Tailwind v4 CSS-first tokens, React 19 and TypeScript. Keep the existing component patterns when changing a screen.

## 3. Semantic colors
Use `bg-brand`, `text-ink`, `text-ink-muted`, `bg-surface`, `bg-canvas`, `border-line` and existing status tokens. Theme definitions and accent presets determine actual colors. Do not hardcode historical palette values in components.

## 4. Components
Use shared primitives where available. Interactive controls need accessible names, visible focus states, loading/error feedback and usable touch targets. Check modal content and actions with the phone keyboard open.

## 5. Typography and labels
Arabic is the default; use the shared language context for bilingual labels. Domain enum values and status labels belong in `packages/shared-types`. Allow text to wrap at narrow widths; preserve readability in light and dark themes.

## 6. Direction
Use logical spacing and alignment (`ps`, `pe`, `ms`, `me`, `start`, `end`). Put phone numbers, prices, identifiers and verification-code inputs in `dir="ltr"`. Mirror directional icons where appropriate.

## 7. Layout and motion
Respect Android/iOS safe areas and fixed bottom navigation. New pages should open at a useful position. Support reduced motion and distinguish horizontal carousel gestures from vertical scrolling. Test empty, loading, error and populated states.

## 8. Prices and delivery
Shared types and API logic define pricing. The server computes product totals from stored prices; the client never submits trusted product prices. Delivery-fee display must follow the active platform pricing mode and shared formatting rules. Update each theme's vendored delivery helper when those rules change. Do not use obsolete design notes as a pricing specification.
