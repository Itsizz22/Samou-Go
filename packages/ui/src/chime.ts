/**
 * Audio chimes for new-order notifications.
 *
 * Uses the Web Audio API so there is no audio file to bundle.
 * Both functions are no-ops in environments without AudioContext (SSR, Node).
 */

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/**
 * Plays a two-tone "ding-dong" chime — used when a new order arrives in
 * the store-manager and captain dashboards.
 */
export function playNewOrderChime(): void {
  const ctx = createContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  [523.25, 659.25].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.35);
  });

  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
}

/**
 * Short single beep — useful for testing that audio is working in dev.
 */
export function playTestBeep(): void {
  const ctx = createContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.3);
}
