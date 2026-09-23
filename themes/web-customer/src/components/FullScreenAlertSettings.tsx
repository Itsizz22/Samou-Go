import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useLanguage } from '@samou-go/ui';

const Settings = registerPlugin<{
  getFullScreenAlertPermission(): Promise<{ enabled: boolean }>;
  openFullScreenAlertSettings(): Promise<void>;
}>('Settings');

export function FullScreenAlertSettings() {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const android = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  useEffect(() => {
    if (!android) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await Settings.getFullScreenAlertPermission();
        if (!disposed) { setEnabled(result.enabled); setError(false); }
      } catch { if (!disposed) setError(true); }
    };
    void refresh();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh(); });
    return () => { disposed = true; void listener.then(handle => handle.remove()).catch(() => undefined); };
  }, [android]);

  if (!android) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">{t('تنبيه الطلبات على شاشة القفل', 'Lock-screen order alerts')}</h2>
      <p className="mt-2 text-sm text-ink-muted">
        {t('اسمح بظهور صفحة الطلب عند قفل الهاتف. هذه صلاحية مستقلة عن إذن الإشعارات والرنين، وتحتاج موافقتك من إعدادات الهاتف.', 'Allow the order alert to appear while the phone is locked. This is separate from notifications and ringing and requires your approval in phone settings.')}
      </p>
      <p className="mt-3 text-sm font-bold" role="status">
        {error ? t('تعذّر التحقق؛ تأكد من تثبيت آخر نسخة وافحص إعدادات الهاتف.', 'Unable to check. Update the app and check phone settings.') : enabled === null ? t('جارٍ التحقق…', 'Checking…') : enabled ? t('صلاحية ملء الشاشة مفعّلة', 'Full-screen permission is enabled') : t('صلاحية ملء الشاشة غير مفعّلة', 'Full-screen permission is disabled')}
      </p>
      <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          try { await Settings.openFullScreenAlertSettings(); }
          catch { setError(true); }
          finally { setBusy(false); }
        }}>
        {enabled ? t('إدارة صلاحية التنبيه', 'Manage alert permission') : t('تفعيل تنبيه شاشة القفل', 'Enable lock-screen alert')}
      </button>
    </section>
  );
}
