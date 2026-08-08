import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { playNewOrderChime } from '../chime';

/**
 * A single row in the bell dropdown.
 *
 * There is no notifications table yet, so each app *derives* its own list from
 * what it already polls (new orders, stores awaiting approval, status changes)
 * and feeds it in. Read state is local: IDs are remembered in `localStorage`.
 */
export interface BellNotification {
  /** Stable across polls so the badge can deduplicate. */
  id: string;
  /** Arabic title — the primary label in an RTL UI. */
  ar: string;
  /** Optional English subtitle. */
  en?: string;
  /** Short time/status caption, e.g. "قبل دقيقة" or an order number. */
  caption?: string;
  /** Optional target — tapped rows call `onNavigate` with this. */
  href?: string;
  /** Left accent tint; `brand` is the default. */
  tone?: 'brand' | 'warning' | 'danger' | 'info';
}

export interface NotificationBellProps {
  notifications: BellNotification[];
  /** Namespace for the localStorage read-marker, e.g. `"captain"` or `"admin"`. */
  storageKey: string;
  /** Play the new-order chime once per brand-new notification id. */
  chimeOnNew?: boolean;
  /** Called when the user taps a row that carries an `href`. */
  onNavigate?: (href: string) => void;
  /** Set on a brand-green header so the icon and hover read as white-on-green. */
  onDark?: boolean;
  className?: string;
  labelAr?: string;
  labelEn?: string;
  emptyAr?: string;
  emptyEn?: string;
  markAllAr?: string;
  markAllEn?: string;
  /** Cap on rows rendered; older items are hidden, not dropped from counts. */
  max?: number;
}

const READ_KEY = 'samou-go.readNotifications';

function readReadIds(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${READ_KEY}.${storageKey}`);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeReadIds(storageKey: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(`${READ_KEY}.${storageKey}`, JSON.stringify([...ids]));
  } catch {
    /* Private mode — read state just lives for the session. */
  }
}

const TONE_DOT: Record<NonNullable<BellNotification['tone']>, string> = {
  brand: 'bg-brand',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

/**
 * Header bell with a live badge, an RTL dropdown, and "mark all as read".
 *
 * The dropdown closes on outside click and Escape, and rows with an `href`
 * hand navigation back to the app via `onNavigate` instead of owning router
 * state (this package knows nothing about the app's routing).
 */
export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  storageKey,
  chimeOnNew = false,
  onNavigate,
  onDark = false,
  className,
  labelAr = 'الإشعارات',
  labelEn = 'Notifications',
  emptyAr = 'لا إشعارات جديدة',
  emptyEn = 'You are all caught up',
  markAllAr = 'تحديد الكل كمقروء',
  markAllEn = 'Mark all as read',
  max = 20,
}) => {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(() => readReadIds(storageKey));
  const rootRef = useRef<HTMLDivElement>(null);
  const chimedRef = useRef<Set<string>>(new Set());

  const unread = useMemo(
    () => notifications.filter((n) => !read.has(n.id)),
    [notifications, read]
  );

  // One chime per new id, on the first poll that shows it.
  useEffect(() => {
    if (!chimeOnNew || notifications.length === 0) return;
    for (const n of notifications) {
      if (!chimedRef.current.has(n.id)) {
        chimedRef.current.add(n.id);
        playNewOrderChime();
      }
    }
  }, [notifications, chimeOnNew]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markAll = useCallback(() => {
    setRead((prev) => {
      const next = new Set(prev);
      for (const n of notifications) next.add(n.id);
      writeReadIds(storageKey, next);
      return next;
    });
  }, [notifications, storageKey]);

  const markRead = useCallback(
    (id: string) => {
      setRead((prev) => {
        const next = new Set(prev);
        next.add(id);
        writeReadIds(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const rows = notifications.slice(0, max);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`${labelAr} / ${labelEn}`}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40',
          onDark ? 'hover:bg-white/15' : 'hover:bg-canvas'
        )}
      >
        <Bell className={cn('h-[21px] w-[21px]', onDark ? 'text-white' : 'text-ink-soft')} />
        {unread.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-raised"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/50 px-4 py-3">
            <p className="text-sm font-bold text-ink">
              {labelAr} <span dir="ltr" className="text-[10px] font-semibold text-ink-subtle">{labelEn}</span>
            </p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-brand-deep transition hover:bg-brand-tint"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markAllAr}
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-ink-muted">{emptyAr}</p>
              <p dir="ltr" className="text-[10px] text-ink-subtle">{emptyEn}</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto" aria-label={labelAr}>
              {rows.map((n) => {
                const isUnread = !read.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        markRead(n.id);
                        if (n.href) onNavigate?.(n.href);
                        else setOpen(false);
                      }}
                      className="flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-start transition last:border-b-0 hover:bg-canvas/60 active:bg-canvas"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[n.tone ?? 'brand'])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold leading-snug text-ink">
                          {n.ar}
                          {isUnread && <span className="ms-2 rounded-full bg-brand-tint px-1.5 py-0.5 text-[9px] font-bold text-brand-deep">جديد</span>}
                        </span>
                        {n.en && (
                          <span dir="ltr" className="mt-0.5 block text-[11px] text-ink-muted">
                            {n.en}
                          </span>
                        )}
                        {n.caption && (
                          <span className="mt-0.5 block text-[10px] text-ink-subtle">{n.caption}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
