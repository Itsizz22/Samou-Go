/**
 * Samou' Go — new-order audio chime and looping alert.
 *
 * A tiny Web Audio API synth so the store manager / admin / captain hears a new
 * order arrive even with the tab in the background. No audio asset to download,
 * no autoplay-policy problem: the AudioContext is created lazily on the first
 * user gesture (they have already signed in by then), which is all browsers
 * require. `playNewOrderChime` is a no-op where audio is unavailable (SSR, Node).
 *
 * `createLoopingAlert` returns a stop function and plays a repeating chime
 * pattern until either `stop()` is called or `maxMs` (default 10 s) elapses.
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!sharedContext) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      sharedContext = new Ctor();
    }
    if (sharedContext.state === 'suspended') {
      void sharedContext.resume();
    }
    return sharedContext;
  } catch {
    return null;
  }
}

/** Plays one sine tone with a quick attack/release envelope. */
function tone(ctx: AudioContext, frequency: number, startAt: number, duration: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // Avoid a click at the start/end of the note.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/**
 * Plays the "new order" chime. Safe to call at any time — it is a no-op when
 * the browser blocks audio or the API is unavailable.
 */
export function playNewOrderChime(): void {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // A friendly two-note "ding-dong" (E5 → A5), about 280 ms.
  tone(ctx, 659.25, now, 0.16);
  tone(ctx, 880.0, now + 0.12, 0.22);
}

/**
 * Play a looping new-order alert.
 *
 * Repeats the chime pattern every 1.2 seconds for up to `maxMs`
 * (default 10 000 ms). Returns a `stop()` function — call it when the user
 * acknowledges/taps the notification. If the AudioContext is unavailable, this
 * is a silent no-op that still returns a functional `stop()`.
 */
export function createLoopingAlert(maxMs = 10_000): () => void {
  const raw = getContext();
  if (!raw) return () => {};

  // Narrow the type so closures capture a non-null AudioContext.
  const ctx: AudioContext = raw;

  let stopped = false;
  const intervalMs = 1200;
  const startTime = ctx.currentTime;

  function playOnce(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    tone(ctx, 659.25, now, 0.14);
    tone(ctx, 880.0, now + 0.10, 0.18);
    tone(ctx, 659.25, now + 0.30, 0.14);
  }

  // First chime immediately.
  playOnce();

  const timer = setInterval(() => {
    if (stopped) {
      clearInterval(timer);
      return;
    }
    // Auto-stop after maxMs.
    if ((ctx.currentTime - startTime) * 1000 >= maxMs) {
      stopped = true;
      clearInterval(timer);
      return;
    }
    playOnce();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * High-intensity infinite looping alert with vibration.
 *
 * Plays the chime on an infinite loop until `stop()` is called.
 * Also triggers device vibration (where supported) in a repeating pattern.
 * Designed for new-order dispatch alerts in the store-manager app.
 */
export function createInfiniteLoopingAlert(): () => void {
  const raw = getContext();
  if (!raw) return () => {};
  const ctx: AudioContext = raw;

  let stopped = false;
  const intervalMs = 1200;

  // Vibration pattern: vibrate 500ms, pause 250ms, repeat
  let vibrationInterval: ReturnType<typeof setInterval> | null = null;
  const hasVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  if (hasVibration) {
    navigator.vibrate!([500, 250, 500, 250]);
    vibrationInterval = setInterval(() => {
      if (stopped && vibrationInterval) {
        clearInterval(vibrationInterval);
        navigator.vibrate!(0); // cancel vibration
        return;
      }
      navigator.vibrate!([500, 250, 500, 250]);
    }, 1500);
  }

  function playOnce(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    // High-intensity urgent chime: ascending triple-tone
    tone(ctx, 659.25, now, 0.12);
    tone(ctx, 880.0, now + 0.08, 0.14);
    tone(ctx, 1046.5, now + 0.20, 0.18);
  }

  playOnce();

  const timer = setInterval(() => {
    if (stopped) {
      clearInterval(timer);
      return;
    }
    playOnce();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    if (vibrationInterval) clearInterval(vibrationInterval);
    if (hasVibration) navigator.vibrate!(0);
  };
}

/**
 * Trigger a single short vibration burst (for UI feedback).
 */
export function vibrateOnce(pattern: number[] = [100]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate!(pattern);
    }
  } catch { /* no-op */ }
}
