/**
 * Samou' Go — new-order audio chime.
 *
 * A tiny Web Audio API synth so the store manager hears a new order arrive
 * even with the tab in the background of a busy kitchen. No audio asset to
 * download, no autoplay policy problem: the AudioContext is created lazily on
 * the first user gesture (the manager has already signed in by then), which is
 * all browsers require.
 *
 * The chime is two short sine tones — a quick "ding-dong" — kept quiet enough
 * to sit under kitchen noise.
 */

/** Shared context, created lazily because Safari requires a user gesture first. */
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
function tone(context: AudioContext, frequency: number, startAt: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // Avoid a click at the start/end of the note.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/**
 * Plays the "new order" chime. Safe to call at any time — it is a no-op when
 * the browser blocks audio or the API is unavailable.
 */
export function playNewOrderChime(): void {
  const context = getContext();
  if (!context) return;

  const now = context.currentTime;
  // A friendly two-note "ding-dong" (E5 → A5), about 280 ms.
  tone(context, 659.25, now, 0.16);
  tone(context, 880.0, now + 0.12, 0.22);
}

/** Debug/test helper: plays a lower, single "boop". */
export function playTestBeep(): void {
  const context = getContext();
  if (!context) return;
  tone(context, 440.0, context.currentTime, 0.2);
}

