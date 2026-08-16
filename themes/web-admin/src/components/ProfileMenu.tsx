/**
 * Samou' Go — Admin profile menu.
 *
 * The top-bar identity pill becomes a dropdown with the signed-in admin's
 * details and a sign-out action. Closes on outside click / Escape like the
 * notification bell, and hands sign-out back to the caller's auth instance.
 */
import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';

interface ProfileMenuProps {
  name: string;
  phone: string;
  onSignOut: () => void;
}

export function ProfileMenu({ name, phone, onSignOut }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${name} — قائمة الحساب / Account menu`}
        className="flex items-center gap-2 rounded-full p-1 transition hover:bg-canvas active:scale-95"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-xs font-extrabold text-brand-dark">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden text-end md:block">
          <strong className="block text-xs">{name}</strong>
          <span dir="rtl" className="block text-micro text-ink-muted">مدير النظام</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-raised"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-xs font-extrabold">{name}</p>
            <p dir="ltr" className="mt-0.5 truncate text-micro text-ink-muted">{phone}</p>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs font-bold text-danger-ink transition hover:bg-danger-tint"
            >
              <LogOut size={14} />
              تسجيل الخروج <span dir="ltr" className="font-medium text-danger-ink/70">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;