/**
 * Samou' Go — `/settings`.
 *
 * Theme colours (accent palette + dark/light mode), notification and language
 * preferences. Theme state lives in `ThemeProvider` (persisted to localStorage);
 * language lives in the shared reactive `useLanguage` context from `@samou-go/ui`,
 * which flips `<html lang/dir>`, persists to `samou-go.language`, and broadcasts
 * the `samou-go:language` CustomEvent so every Samou' Go app stays in sync.
 * Every control applies instantly — no restart, no reload.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check, Globe, Loader2, MapPin, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
import { updateMyLocation, useAuth } from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_OPTIONS } from '@/theme/presets';

const NOTIFICATIONS_STORAGE_KEY = 'samou.settings.notifications';

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
  const { t } = useLanguage();
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
          <Icon size={18} />
        </span>
        <div className="flex-1 text-end">
          <h2 className="text-sm font-extrabold">{t(titleAr, titleEn)}</h2>
        </div>
      </div>
      {hint && <p className="mt-1 text-end text-micro text-ink-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const auth = useAuth();
  const user = auth.user;
  const { accent, mode, setAccent, setMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const isArabic = language === 'ar';
  const [notifications, setNotifications] = useState(() =>
    readBoolean(NOTIFICATIONS_STORAGE_KEY, true)
  );
  const [locationMessage, setLocationMessage] = useState<{ ar: string; en: string } | null>(null);
  const [locBusy, setLocBusy] = useState(false);

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

  const hasLocation =
    user?.latitude != null && user?.longitude != null;

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage({ ar: 'تحديد الموقع غير مدعوم في هذا المتصفح', en: 'Geolocation is unavailable' });
      return;
    }
    setLocBusy(true);
    setLocationMessage({ ar: 'جارٍ تحديد موقعك…', en: 'Detecting your location…' });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // Persist to the server profile AND update the cached session so the
          // settings screen (and the first-login prompt) reflect the saved coords.
          const updated = await updateMyLocation(coords.latitude, coords.longitude);
          if (updated) auth.setUser(updated);
          setLocationMessage({
            ar: `تم حفظ موقعك: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
            en: `Location saved: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
          });
        } catch {
          setLocationMessage({
            ar: 'تعذّر حفظ الموقع — حاول مجدداً',
            en: 'Could not save your location — try again',
          });
        } finally {
          setLocBusy(false);
        }
      },
      () => {
        setLocBusy(false);
        setLocationMessage({
          ar: 'تعذر تحديد الموقع. يرجى السماح بإذن الموقع',
          en: 'Location permission was not granted.',
        });
      },
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
                    {t(option.labelAr, option.labelEn)}
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
                  <Sun size={13} /> {t('فاتح', 'Light')}
                </>
              ) : (
                <>
                  <Moon size={13} /> {t('داكن', 'Dark')}
                </>
              )
            }
          />
        </SettingsRow>

        <SettingsRow icon={Globe} titleAr="اللغة" titleEn="Language" hint="عربي افتراضي — يدعم النظام الاتجاهين">
          <Segmented
            options={['ar', 'en'] as const}
            value={language}
            onChange={setLanguage}
            getLabel={(option) => (option === 'ar' ? 'العربية' : 'English')}
          />
        </SettingsRow>

        <SettingsRow icon={MapPin} titleAr="العناوين والمواقع" titleEn="Saved Addresses & GPS" hint="استخدم موقع الجهاز لتسهيل كتابة عنوان التوصيل">
          <div className="rounded-xl bg-canvas p-3">
            {hasLocation ? (
              <p className="text-micro text-ink" dir="ltr">
                <span className="ms-1 text-ink-muted">{t('الموقع المحفوظ:', 'Saved location:')}</span>{' '}
                {user!.latitude!.toFixed(5)}, {user!.longitude!.toFixed(5)}
              </p>
            ) : (
              <p className="text-micro text-warning-ink">
                {t('لم يتم حفظ موقعك بعد', 'No location saved yet')}
              </p>
            )}
            <button
              type="button"
              onClick={detectLocation}
              disabled={locBusy}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
            >
              {locBusy ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
              {t(hasLocation ? 'تحديث موقعي الحالي' : 'تحديد موقعي الحالي', hasLocation ? 'Update my location' : 'Detect current location')}
            </button>
          </div>
          {locationMessage && <p className="mt-2 text-[11px] text-ink-muted" dir="auto">{isArabic ? locationMessage.ar : locationMessage.en}</p>}
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
            {t(notifications ? 'الإشعارات مفعّلة' : 'الإشعارات متوقفة', notifications ? 'On' : 'Off')}
          </p>
        </SettingsRow>
      </div>
    </ScreenShell>
  );
}
