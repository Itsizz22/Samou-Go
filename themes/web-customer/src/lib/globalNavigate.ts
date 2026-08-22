/**
 * Global navigate singleton.
 *
 * Non-React code — Capacitor push-notification listeners, service-worker
 * message handlers — cannot call `useNavigate()`. This module lets the root
 * component register its `navigate` function once, and any module can import
 * `globalNavigate` to trigger SPA-safe navigation (no full page reload).
 *
 * Only navigation that MUST happen outside React should use this. Screen-
 * level navigation should always call `useNavigate()` directly.
 */

import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

let _navigate: NavigateFunction | null = null;

/** Called once by the root <App> component. */
export function setGlobalNavigate(fn: NavigateFunction): void {
  _navigate = fn;
}

/** Navigate to a path via SPA router. Returns false if the router isn't wired yet. */
export function globalNavigate(to: To, options?: NavigateOptions): boolean {
  if (_navigate) {
    _navigate(to, options);
    return true;
  }
  return false;
}

/** Navigate by delta (e.g. -1 for back). Returns false if the router isn't wired yet. */
export function globalNavigateBack(delta: number = -1): boolean {
  if (_navigate) {
    _navigate(delta);
    return true;
  }
  return false;
}
