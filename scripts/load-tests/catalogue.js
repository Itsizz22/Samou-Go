import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
const invalidResponses = new Rate('invalid_responses');
const base = (__ENV.BASE_URL || 'https://samou-go.onrender.com/api/v1').replace(/\/$/, '');
const peakUsers = Number(__ENV.PEAK_USERS || 10);
if (!Number.isInteger(peakUsers) || peakUsers < 1 || peakUsers > 500) throw new Error('PEAK_USERS must be 1–500');
export const options = {
  stages: [
    { duration: '15s', target: 1 },
    { duration: '20s', target: 5 },
    { duration: '25s', target: 5 },
    { duration: peakUsers > 100 ? '60s' : '30s', target: peakUsers },
    { duration: '60s', target: peakUsers },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '15s' }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '15s' }],
    invalid_responses: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '15s' }],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  userAgent: 'SamouQuick-Authorized-k6-ReadOnly-Audit',
};
export function setup() {
  const response = http.get(`${base}/stores`, { timeout: '15s', tags: { name: 'stores_setup' } });
  if (response.status !== 200) throw new Error(`Catalogue unavailable: ${response.status}`);
  const body = response.json();
  const storeId = body?.data?.items?.[0]?.id;
  if (!storeId) throw new Error('No store to test');
  return { storeId };
}
export default function ({ storeId }) {
  const paths = ['/stores', '/zones', '/stores/featured-products', `/stores/${encodeURIComponent(storeId)}/products`];
  const index = (__VU + __ITER) % paths.length;
  const response = http.get(`${base}${paths[index]}`, { timeout: '10s', tags: { name: ['stores', 'zones', 'featured_products', 'store_products'][index] } });
  let valid = false;
  try { valid = response.status === 200 && response.json()?.success === true; } catch { /* Invalid JSON counts as failure. */ }
  invalidResponses.add(!valid);
  check(response, { 'HTTP 200 and valid API envelope': () => valid });
  sleep(1 + Math.random());
}
