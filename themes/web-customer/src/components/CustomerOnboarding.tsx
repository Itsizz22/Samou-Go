import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@samou-go/ui';
import { useDeliveryZone, ZoneSelector } from './ZoneProvider';
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
            <ZoneSelector />
            <button
              className="btn-primary min-h-11 w-full"
              disabled={!zone.activeZone}
              onClick={() => setStep('action')}
            >
              متابعة
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
