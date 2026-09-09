import { checkOrderSubmission } from '@samou-go/api-client';
interface Attempt {
  requestId: string;
  fingerprint: string;
}
const memory = new Map<string, Attempt>();
/** Persist only a request key and hash, never addresses or payment details. */
export async function submitCheckoutAttempt<P extends object, R>(
  userId: string,
  kind: string,
  payload: P,
  submit: (input: P & { requestId: string }) => Promise<R>
): Promise<R> {
  const key = `samou_checkout_attempt:${userId}`;
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(kind + JSON.stringify(payload))
  );
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(
    ''
  );
  let previous = memory.get(key);
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      raw &&
      typeof raw === 'object' &&
      'requestId' in raw &&
      typeof raw.requestId === 'string' &&
      'fingerprint' in raw &&
      typeof raw.fingerprint === 'string'
    )
      previous = { requestId: raw.requestId, fingerprint: raw.fingerprint };
  } catch {
    /* Memory works when storage is unavailable. */
  }
  if (previous && previous.fingerprint !== fingerprint) {
    const status = await checkOrderSubmission(previous.requestId);
    if (status.completed) {
      memory.delete(key);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Optional storage. */
      }
      throw new Error('تم تأكيد المحاولة السابقة على الخادم. راجع طلباتك قبل تأكيد سلة جديدة.');
    }
    throw new Error('نتيجة المحاولة السابقة غير مؤكدة. أعد نفس بيانات الطلب للتحقق دون تكراره.');
  }
  const attempt = previous ?? { requestId: crypto.randomUUID(), fingerprint };
  memory.set(key, attempt);
  try {
    localStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    /* Keep the in-memory key. */
  }
  const clear = () => {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Optional storage. */
    }
  };
  try {
    const result = await submit({ ...payload, requestId: attempt.requestId });
    clear();
    return result;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status >= 400 &&
      error.status < 500 &&
      ![408, 409, 429].includes(error.status)
    )
      clear();
    throw error;
  }
}
