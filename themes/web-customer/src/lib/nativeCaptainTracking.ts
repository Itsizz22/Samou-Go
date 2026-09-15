import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { API_URL, getToken, setNativeCaptainTracker } from '@samou-go/api-client';
const locationPlugin = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

if (Capacitor.isNativePlatform()) setNativeCaptainTracker((orderId, onMessage) => {
  let disposed = false;
  let watcher: string | undefined;
  let sending = false;
  let attemptedAt = 0;
  let lastSent: { lat: number; lng: number; at: number } | undefined;
  const accessToken = getToken();
  const stop = () => {
    disposed = true;
    if (watcher) void locationPlugin.removeWatcher({ id: watcher }).catch(() => {});
  };
  if (!accessToken) return stop;
  onMessage('جارٍ تشغيل مشاركة الموقع للطلب النشط…');
  void locationPlugin.addWatcher({
    backgroundTitle: 'Samou Quick — توصيل نشط',
    backgroundMessage: 'تتم مشاركة موقعك للطلب النشط. تنتهي المشاركة عند انتهاء الطلب أو تسجيل الخروج.',
    requestPermissions: true, stale: false, distanceFilter: 0,
  }, (position, error) => {
    if (disposed) return;
    if (getToken() !== accessToken) { stop(); return; }
    if (error) { onMessage(error.code === 'NOT_AUTHORIZED' ? 'اسمح بمشاركة الموقع أثناء التوصيل من إعدادات الجهاز' : 'تعذر تحديد الموقع؛ تحقق من GPS'); return; }
    if (!position || !position.time || Date.now() - position.time > 30000 || position.time > Date.now() + 5000) return;
    if (!Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90 || !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180) return;
    if (!Number.isFinite(position.accuracy) || position.accuracy < 0 || position.accuracy > 150) { onMessage('دقة الموقع ضعيفة؛ انتقل إلى مكان مكشوف'); return; }
    if (sending || Date.now() - attemptedAt < 10000) return;
    // A stationary heartbeat stays fresh without repeatedly uploading identical samples.
    if (lastSent && lastSent.lat === position.latitude && lastSent.lng === position.longitude && Date.now() - lastSent.at < 30000) return;
    sending = true; attemptedAt = Date.now();
    // Native HTTP avoids Android throttling of WebView fetch after backgrounding.
    void CapacitorHttp.request({
      url: `${API_URL}/platform/captains/me/location`, method: 'PUT',
      connectTimeout: 10000, readTimeout: 10000,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: { orderId, lat: position.latitude, lng: position.longitude, capturedAt: position.time, accuracy: position.accuracy,
        ...(position.bearing !== null && position.bearing >= 0 && position.bearing < 360 ? { heading: position.bearing } : {}) },
    }).then(response => {
      if (disposed) return;
      if (response.status >= 200 && response.status < 300) lastSent = { lat: position.latitude, lng: position.longitude, at: Date.now() };
      if (response.status === 401 || response.status === 403) { onMessage('توقفت مشاركة الموقع؛ تحقق من الجلسة والطلب النشط'); stop(); }
      else onMessage(response.status >= 200 && response.status < 300 ? 'تتم مشاركة موقعك للطلب النشط' : 'تعذر إرسال الموقع؛ ستُرسل قراءة جديدة عند تحسن الاتصال');
    }, () => { if (!disposed) onMessage('تعذر إرسال الموقع؛ تحقق من الإنترنت'); }).finally(() => { sending = false; });
  }).then(id => { watcher = id; if (disposed) void locationPlugin.removeWatcher({ id }).catch(() => {}); })
    .catch(() => { if (!disposed) onMessage('تتبع الخلفية غير متاح؛ تحقق من الأذونات وإصدار التطبيق'); });
  return stop;
});
