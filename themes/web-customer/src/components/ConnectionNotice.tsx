import { useEffect, useState } from 'react';
export function ConnectionNotice({
  loading = false,
  failed = false,
  retry,
}: {
  loading?: boolean;
  failed?: boolean;
  retry?: () => void;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);
  if (online && !slow && !failed) return null;
  return (
    <aside
      role="status"
      className="mx-auto my-3 max-w-md rounded-2xl border border-line bg-surface p-4 text-sm text-ink"
    >
      <p>
        {!online
          ? 'أنت غير متصل بالإنترنت. سلتك محفوظة؛ أعد الاتصال للمتابعة.'
          : failed
            ? 'تعذر الاتصال بالخادم. سلتك محفوظة، حاول مجددًا.'
            : 'الاتصال بالخادم يستغرق وقتًا أطول من المعتاد. قد يستغرق بدء الخدمة قليلًا.'}
      </p>
      {retry && (
        <button
          type="button"
          disabled={!online}
          onClick={retry}
          className="min-h-11 font-bold text-brand disabled:opacity-50"
        >
          إعادة المحاولة
        </button>
      )}
    </aside>
  );
}
