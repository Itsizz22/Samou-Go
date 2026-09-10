import { usePlatformSettings } from './useApi';
import { useEffect, useState } from 'react';
import { sendCaptainPosition } from './api';
import { FEATURE_FLAGS } from './config/features';
export function useCaptainTracking(orderId: string | undefined, enabled: boolean) {
  const settings = usePlatformSettings({ enabled });
  const sharingEnabled = enabled && (settings.data?.gpsCaptureEnabled ?? false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_LIVE_GPS_TRACKING || !sharingEnabled || !orderId) { setMessage(''); return; }
    if (!navigator.geolocation) { setMessage('خدمة الموقع غير متاحة على هذا الجهاز'); return; }
    let watch: number | undefined; let disposed = false; let sending = false; let lastSent = 0;
    const stop = () => { if (watch !== undefined) navigator.geolocation.clearWatch(watch); watch = undefined; };
    const start = () => {
      stop(); if (document.hidden || disposed) { setMessage('تحديث الموقع متوقف أثناء إخفاء التطبيق'); return; }
      setMessage('جارٍ تحديد موقعك للتوصيل…');
      watch = navigator.geolocation.watchPosition(position => {
        if (disposed || sending || Date.now() - lastSent < 10000) return;
        if (position.coords.accuracy > 150) { setMessage('دقة الموقع ضعيفة؛ انتقل إلى مكان مكشوف'); return; }
        sending = true;
        void sendCaptainPosition({ orderId, lat: position.coords.latitude, lng: position.coords.longitude, ...(position.coords.heading != null ? { heading: position.coords.heading } : {}) }).then(() => { lastSent = Date.now(); if (!disposed) setMessage('تتم مشاركة موقعك أثناء فتح التطبيق'); }, () => { if (!disposed) setMessage('تعذر إرسال الموقع؛ تحقق من الإنترنت'); }).finally(() => { sending = false; });
      }, error => { if (!disposed) setMessage(error.code === 1 ? 'اسمح بالوصول إلى الموقع من إعدادات التطبيق لتفعيل التتبع' : 'تعذر تحديد موقعك؛ تحقق من GPS وحاول مجددًا'); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    };
    start(); document.addEventListener('visibilitychange', start);
    return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', start); };
  }, [orderId, sharingEnabled, retry]);
  return { message, retry: () => setRetry(n => n + 1) };
}
