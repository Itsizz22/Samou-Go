import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptainReservation, setToken, ConnectionNotice } from '@samou-go/api-client';
import { NotificationAuditPanel } from '../../web-admin/src/components/NotificationAuditPanel';
import '../src/index.css';
setToken('qa-fixture-token');
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('/admin/notifications')) return Response.json({ success: true, data: { items: [{ id: 'qa', userId: 'كابتن تجريبي', orderId: 'SQ-QA', title: 'الطلب جاهز للاستلام', type: 'NEW_ORDER', status: 'ACCEPTED', sentCount: 1, failedCount: 0, errorCode: null, openedAt: null, createdAt: new Date().toISOString() }], total: 1, page: 1, schedulerHealthy: true, heartbeat: { lastSucceededAt: new Date().toISOString() } } });
  if (url.endsWith('/orders/qa/release')) return Response.json({ success: true, data: { released: true } });
  return nativeFetch(input, init);
};
function Preview() {
  const [owned, setOwned] = useState(true);
  return <main className="mx-auto max-w-md space-y-8 p-4"><ConnectionNotice /><section className="card-surface p-4"><h1 className="text-lg font-bold">طلب تجريبي — قيد التحضير</h1><CaptainReservation order={{ id: 'qa', status: 'PREPARING', captainId: owned ? 'captain' : null }} captainId="captain" onReserved={() => setOwned(false)} /></section><NotificationAuditPanel /></main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
