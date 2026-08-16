/**
 * Samou' Go — Admin notifications drawer.
 *
 * A slide-over panel (instead of a plain dropdown) so the feed stays readable
 * on small screens. Notifications are derived per-app from the stats aggregate
 * — there is still no notifications table — and read state is remembered in
 * `localStorage` under the same `samou-go.readNotifications.admin` key the old
 * bell used, so a user's "read" markers survive the component swap.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, X } from 'lucide-react';
import { playNewOrderChime, type BellNotification } from '@samou-go/ui';
import { cn } from '@samou-go/ui';

const READ_KEY = 'samou-go.readNotifications.admin';

function readIds(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeIds(ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* Private mode — read state lives for the session. */
  }
}

/** Compact Arabic relative-time caption, e.g. "قبل 5 د". */
export function relativeTimeArabic(iso: string, now = Date.now()): string {
  try {
    const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'الآن';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `قبل ${minutes} د`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `قبل ${hours} س`;
    return `قبل ${Math.round(hours / 24)} ي`;
  } catch {
    return '';
  }
}

const TONE_DOT: Record<NonNullable<BellNotification['tone']>, string> = {
  brand: 'bg-brand',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

interface NotificationsDrawerProps {
  notifications: BellNotification[];
  /** Rows with an `href` call this (the dashboard maps them onto panels). */
  onNavigate?: (target: string) => void;
  className?: string;
}

export function NotificationsDrawer({ notifications, onNavigate, className }: NotificationsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<ReadonlySet<string>>(() => readIds());
  const chimedRef = useRef<ReadonlySet<string>>(new Set());

  const unread = useMemo(
    () => notifications.filter((notification) => !read.has(notification.id)),
    [notifications, read]
  );

  // One chime per brand-new notification id (share the app's "new order" sound).
  useEffect(() => {
    for (const notification of notifications) {
      if (!chimedRef.current?.has(notification.id)) {
        chimedRef.current = new Set(chimedRef.current ?? []).add(notification.id);
        playNewOrderChime();
      }
    }
  }, [notifications]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const markAll = () => {
    setRead((prev) => {
      const next = new Set(prev);
      for (const notification of notifications) next.add(notification.id);
      writeIds(next);
      return next;
    });
  };

  const openItem = (notification: BellNotification) => {
    setRead((prev) => {
      const next = new Set(prev);
      next.add(notification.id);
      writeIds(next);
      return next;
    });
    setOpen(false);
    if (notification.href) onNavigate?.(notification.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="الإشعارات / Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-canvas active:scale-95',
          className
        )}
      >
        <Bell className="h-[21px] w-[21px] text-ink-soft" />
        {unread.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-micro font-bold leading-none text-white"
          >
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="presentation">
          <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="false"
            aria-label="Notifications"
            className="absolute end-4 top-[4.75rem] flex max-h-[min(34rem,calc(100vh-6rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-raised"
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-sm font-extrabold">
                  الإشعارات{' '}
                  <span dir="ltr" className="ms-1 text-micro font-semibold text-ink-muted">
                    Notifications
                  </span>
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {unread.length} غير مقروء <span dir="ltr">· unread</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {unread.length > 0 && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-brand-deep transition hover:bg-brand-tint"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> الكل مقروء
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="rounded-lg p-2 text-ink-muted transition hover:bg-canvas"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {notifications.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <Inbox className="text-ink-subtle" size={28} />
                <p className="text-sm font-semibold text-ink-muted">لا إشعارات جديدة</p>
                <p dir="ltr" className="text-micro text-ink-muted">You are all caught up</p>
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto" aria-label="Notifications">
                {notifications.map((notification) => {
                  const isUnread = !read.has(notification.id);
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => openItem(notification)}
                        className={cn(
                          'flex w-full items-start gap-3 border-b border-line/60 px-5 py-3.5 text-start transition',
                          notification.href ? 'hover:bg-canvas/70' : 'cursor-default'
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[notification.tone ?? 'brand'])}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold leading-snug text-ink">
                            {notification.ar}
                            {isUnread && (
                              <span className="ms-2 rounded-full bg-brand-tint px-1.5 py-0.5 text-micro font-bold text-brand-deep">
                                جديد
                              </span>
                            )}
                          </span>
                          {notification.en && (
                            <span dir="ltr" className="mt-0.5 block text-[11px] text-ink-muted">
                              {notification.en}
                            </span>
                          )}
                          {notification.caption && (
                            <span className="mt-0.5 block text-micro text-ink-muted">
                              {notification.caption}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {notifications.length > 0 && (
              <footer className="border-t border-line p-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.('Orders');
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark"
                >
                  عرض كل الطلبات{' '}
                  <span dir="ltr" className="font-medium text-white/80">
                    View orders
                  </span>
                </button>
              </footer>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

export default NotificationsDrawer;
