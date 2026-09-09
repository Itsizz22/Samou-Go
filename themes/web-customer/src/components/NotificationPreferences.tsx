import { useEffect, useState } from 'react';
import { getNotificationPreferences, saveNotificationPreferences } from '@samou-go/api-client';
export function NotificationPreferences() {
  const [value, setValue] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    getNotificationPreferences()
      .then(p => setValue(p.marketingNotificationsEnabled))
      .catch(() => setError('تعذر تحميل التفضيلات'));
  };
  useEffect(load, []);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-bold">تفضيلات الإشعارات</h2>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          disabled={value === null || pending}
          checked={value ?? false}
          onChange={async e => {
            const next = e.target.checked;
            setPending(true);
            setError('');
            try {
              const result = await saveNotificationPreferences(next);
              setValue(result.marketingNotificationsEnabled);
            } catch {
              setError('تعذر الحفظ، أعد المحاولة');
            } finally {
              setPending(false);
            }
          }}
        />
        إشعارات العروض والإعلانات
      </label>
      <p className="text-xs text-ink-muted">تبقى تحديثات طلباتك مفعّلة عند إيقاف الإعلانات.</p>
      {error && (
        <button type="button" onClick={load} className="min-h-11 text-danger-ink">
          {error} — إعادة المحاولة
        </button>
      )}
    </section>
  );
}
