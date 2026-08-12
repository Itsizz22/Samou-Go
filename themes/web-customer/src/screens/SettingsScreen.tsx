/**
 * Samou' Go — `/settings`.
 *
 * Theme colours (accent palette + dark/light mode), notification and language
 * preferences. Theme state lives in `ThemeProvider` (persisted to localStorage);
 * the language reuses the `@samou-go/ui` bootstrap switch which flips
 * `<html lang/dir>`. Every control applies instantly — no restart, no reload.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check, Globe, MapPin, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { setAppLanguage } from '@samou-go/ui';
import { ScreenShell } from '@/components/ScreenShell';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_OPTIONS } from '@/theme/presets';

const NOTIFICATIONS_STORAGE_KEY = 'samou.settings.notifications';
const LANGUAGE_STORAGE_KEY = 'samou-go.language';

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored === '1' || stored === 'true';
  } catch {
    /* Private mode — use the fallback. */
  }
  return fallback;
}

/** Copyable unified switch row used for the segmented controls below. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  getLabel: (option: T) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${
            value === option ? 'bg-brand text-white shadow-card' : 'text-ink-muted'
          }`}
        >
          {getLabel(option)}
          {value === option && <Check size={12} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  titleAr,
  titleEn,
  hint,
  children,
}: {
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
          <Icon size={18} />
        </span>
        <div className="flex-1 text-end">
          <h2 className="text-sm font-extrabold">{titleAr}</h2>
          <p dir="ltr" className="text-[11px] text-ink-muted">
            {titleEn}
          </p>
        </div>
      </div>
      {hint && <p className="mt-1 text-end text-[10px] text-ink-subtle">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const { accent, mode, setAccent, setMode } = useTheme();
  const [language, setLanguage] = useState<'ar' | 'en'>(() =>
    readStoredLanguage()
  );
  const [notifications, setNotifications] = useState(() =>
    readBoolean(NOTIFICATIONS_STORAGE_KEY, true)
  );
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NOTIFICATIONS_STORAGE_KEY,
        notifications ? '1' : '0'
      );
    } catch {
      /* Private mode — preference is lost on reload, acceptable. */
    }
  }, [notifications]);

  const changeLanguage = (next: 'ar' | 'en') => {
    setLanguage(next);
    setAppLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'en' ? 'ltr' : 'rtl';
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('تحديد الموقع غير مدعوم في هذا المتصفح / Geolocation is unavailable');
      return;
    }
    setLocationMessage('جارٍ تحديد موقعك… / Detecting your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocationMessage(`تم حفظ موقعك الحالي: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`),
      () => setLocationMessage('تعذر تحديد الموقع. يرجى السماح بإذن الموقع / Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  return (
    <ScreenShell title="الإعدادات" subtitle="Settings">
      <div className="space-y-4">
        <SettingsRow
          icon={Palette}
          titleAr="لون الواجهة"
          titleEn="Theme accent"
          hint="اختر هوية بصرية معروفة — يتغيّر كل شيء فوراً"
        >
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Accent colour">
            {ACCENT_OPTIONS.map((option) => {
              const active = accent === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAccent(option.key)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition active:scale-[0.98] ${
                    active ? 'border-brand bg-brand-tint' : 'border-line bg-canvas'
                  }`}
                >
                  <span
                    className="h-9 w-9 rounded-full shadow-card"
                    style={{ backgroundColor: option.swatch }}
                  />
                  <span
                    className={`text-[11px] font-bold ${
                      active ? 'text-brand-deep' : 'text-ink-muted'
                    }`}
                  >
                    {option.labelAr}
                  </span>
                  <span dir="ltr" className="text-[9px] text-ink-subtle">
                    {option.labelEn}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow icon={Sun} titleAr="المظهر" titleEn="Appearance" hint="الوضع الداكن يريح العين مساءً">
          <Segmented
            options={['light', 'dark'] as const}
            value={mode}
            onChange={setMode}
            getLabel={(option) =>
              option === 'light' ? (
                <>
                  <Sun size={13} /> فاتح <span dir="ltr">· Light</span>
                </>
              ) : (
                <>
                  <Moon size={13} /> داكن <span dir="ltr">· Dark</span>
                </>
              )
            }
          />
        </SettingsRow>

        <SettingsRow icon={Globe} titleAr="اللغة" titleEn="Language" hint="عربي افتراضي — يدعم النظام الاتجاهين">
          <Segmented
            options={['ar', 'en'] as const}
            value={language}
            onChange={changeLanguage}
            getLabel={(option) => (option === 'ar' ? 'العربية' : 'English')}
          />
        </SettingsRow>

        <SettingsRow icon={MapPin} titleAr="العناوين والمواقع" titleEn="Saved Addresses & GPS" hint="استخدم موقع الجهاز لتسهيل كتابة عنوان التوصيل">
          <button type="button" onClick={detectLocation} className="rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark">
            تحديد موقعي الحالي <span dir="ltr">/ Detect Current Location</span>
          </button>
          {locationMessage && <p className="mt-2 text-[11px] text-ink-muted" dir="auto">{locationMessage}</p>}
        </SettingsRow>

        <SettingsRow
          icon={Bell}
          titleAr="الإشعارات"
          titleEn="Notifications"
          hint="تنبيهات حالة الطلب والطلبات الجديدة"
        >
          <button
            type="button"
            role="switch"
            aria-checked={notifications}
            onClick={() => setNotifications((value) => !value)}
            className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
              notifications ? 'justify-end bg-brand' : 'justify-start bg-line'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full ${
                notifications ? 'bg-white' : 'bg-ink-subtle'
              }`}
            />
          </button>
          <p className="mt-2 text-[11px] text-ink-muted">
            {notifications ? 'الإشعارات مفعّلة' : 'الإشعارات متوقفة'}
            <span dir="ltr" className="ms-1 text-[10px] text-ink-subtle">
              {notifications ? 'On' : 'Off'}
            </span>
          </p>
        </SettingsRow>
      </div>
    </ScreenShell>
  );
}

function readStoredLanguage(): 'ar' | 'en' {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
