/** Browser haptics only: unsupported WebViews and reduced-motion users get a no-op. */
let lastPulse = 0;
function pulse(pattern: number | number[]): void {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;
  const now = Date.now();
  if (now - lastPulse < 100) return;
  lastPulse = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* Optional sensory feedback. */
  }
}
export async function hapticTap(): Promise<void> {
  pulse(8);
}
export async function hapticConfirm(): Promise<void> {
  pulse(15);
}
export async function hapticSuccess(): Promise<void> {
  pulse([15, 40, 20]);
}
export async function hapticError(): Promise<void> {
  pulse([20, 40, 20]);
}
