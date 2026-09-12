import http from 'k6/http';
import { check, sleep } from 'k6';
const base = (__ENV.BASE_URL || 'http://127.0.0.1:4051/api/v1').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/v1$/.test(base)) throw new Error('This fixture test is restricted to the local isolated database');
const peak = Number(__ENV.PEAK_USERS || 100);
if (!Number.isInteger(peak) || peak < 1 || peak > 500) throw new Error('Peak must be 1–500');
export const options = {
  stages: [{ duration: '15s', target: Math.min(10, peak) }, { duration: '30s', target: peak }, { duration: '30s', target: peak }, { duration: '10s', target: 0 }],
  thresholds: { http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '15s' }], http_req_duration: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '15s' }], checks: ['rate>0.99'] },
  summaryTrendStats: ['avg','med','max','p(95)','p(99)'],
};
export function setup() {
  const response = http.post(base + '/auth/login', JSON.stringify({ phone: '0599992000', password: 'Local-QA-only-2026' }), { headers: { 'Content-Type': 'application/json' } });
  if (response.status !== 200) throw new Error('Local fixture login failed');
  if (!__ENV.ORDER_ID) throw new Error('Provide the local fixture order ID');
  return { token: response.json().data.accessToken };
}
export default function({ token }) {
  const paths = ['/stores', '/delivery-zones', '/stores/restaurant/products', `/platform/orders/${__ENV.ORDER_ID}/chat/peers`, `/platform/orders/${__ENV.ORDER_ID}/chat?peerId=STORE_MANAGER`];
  const index = (__VU + __ITER) % paths.length;
  const r = http.get(base + paths[index], { headers: { Authorization: `Bearer ${token}` }, timeout: '8s', tags: { name: ['stores','zones','products','chat_unread','chat_history'][index] } });
  let valid = false; try { valid = r.status === 200 && r.json().success === true; } catch {}
  check(r, { 'valid response': () => valid });
  sleep(1 + Math.random());
}
