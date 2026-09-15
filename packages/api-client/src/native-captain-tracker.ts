/** Native shells may supply background tracking; browsers retain foreground-only GPS. */
export type NativeCaptainTracker = (orderId: string, onMessage: (message: string) => void) => () => void;
let tracker: NativeCaptainTracker | null = null;
export function setNativeCaptainTracker(value: NativeCaptainTracker): void { tracker = value; }
export function getNativeCaptainTracker(): NativeCaptainTracker | null { return tracker; }
