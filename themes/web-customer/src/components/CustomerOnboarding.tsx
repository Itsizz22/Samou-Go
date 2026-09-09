import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@samou-go/ui';
import { Check, MapPin } from 'lucide-react';
import { useDeliveryZone } from './ZoneProvider';
export function CustomerOnboarding({ children, returningUser = false }: { children: ReactNode; returningUser?: boolean }) {
  const navigate = useNavigate();
  const zone = useDeliveryZone();
  const [complete, setComplete] = useState(() => {
    try {
      return localStorage.getItem('samou_onboarding_complete') === '1';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState<'zone' | 'action'>('zone');
  const finish = (login: boolean) => {
    try {
      localStorage.setItem('samou_onboarding_complete', '1');
    } catch {
      /* Optional persistence. */
    }
    setComplete(true);
    navigate(login ? '/login' : '/home');
  };
  if (complete || returningUser) return <>{children}</>;
  return (
    <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-canvas p-5 text-ink">
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-md space-y-6 rounded-3xl border border-line bg-surface p-6 shadow-card"
      >
        <div className="mx-auto w-fit rounded-full bg-brand/10 p-4 shadow-lg shadow-brand/20">
          <BrandLogo size={72} />
        </div>
        <h1 className="text-center text-2xl font-extrabold">أهلاً بك في سموع كويك ⚡</h1>
        {step === 'zone' ? (
          <>
            <fieldset disabled={zone.loading} className="min-w-0 space-y-4">
              <legend className="w-full text-center text-lg font-bold">اختر منطقة التوصيل</legend>
              <p className="text-center text-sm text-ink-muted">اضغط على اسم منطقتك للمتابعة</p>
              {zone.loading ? (
                <p role="status" className="py-6 text-center text-sm text-ink-muted">جارٍ تحميل المناطق…</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                  {zone.zones.map(item => (
                    <label key={item.id} className="relative cursor-pointer">
                      <input type="radio" name="onboarding-zone" value={item.id}
                        checked={zone.activeZone?.id === item.id}
                        onChange={() => zone.selectZone(item.id)} className="peer sr-only" />
                      <span className="flex min-h-16 items-center gap-2 rounded-2xl border border-line bg-canvas p-3 text-sm font-bold text-ink transition-colors hover:border-brand/50 peer-checked:border-brand peer-checked:bg-brand/10 peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 motion-reduce:transition-none">
                        <MapPin aria-hidden="true" className="size-4 shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 wrap-break-word">{item.nameAr}</span>
                        <Check aria-hidden="true" className={`size-4 shrink-0 ${zone.activeZone?.id === item.id ? 'opacity-100' : 'opacity-0'}`} />
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            {zone.error && (
              <div role="alert" className="text-center text-sm text-danger-ink">
                <p>{zone.error}</p>
                <button type="button" className="min-h-11 underline underline-offset-4" onClick={zone.reload}>إعادة المحاولة</button>
              </div>
            )}
            {!zone.loading && !zone.error && !zone.zones.length && (
              <p role="status" className="text-center text-sm text-ink-muted">لا توجد مناطق متاحة حالياً</p>
            )}
            <button
              className="btn-primary min-h-11 w-full"
              disabled={zone.loading || !zone.activeZone}
              onClick={() => setStep('action')}
            >
              التالي
            </button>
          </>
        ) : (
          <>
            <p className="text-center">التوصيل إلى {zone.activeZone?.nameAr}</p>
            <button className="btn-primary min-h-11 w-full" onClick={() => finish(false)}>
              تصفح كضيف ⚡
            </button>
            <button
              className="min-h-11 w-full rounded-xl border border-brand text-brand"
              onClick={() => finish(true)}
            >
              تسجيل الدخول / إنشاء حساب
            </button>
            <button className="min-h-11 w-full text-ink-muted" onClick={() => setStep('zone')}>
              تغيير المنطقة
            </button>
          </>
        )}
      </motion.section>
    </main>
  );
}
