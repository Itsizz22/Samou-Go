import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, listActiveDeliveryZones } from '@samou-go/api-client';
import type { DeliveryZone } from '@samou-go/shared-types';

interface ZoneState {
  zones: DeliveryZone[];
  activeZone: DeliveryZone | null;
  loading: boolean;
  error: string;
  selectZone: (id: string) => void;
  reload: () => void;
}
function readCachedZone(): DeliveryZone | null {
  try {
    const zone: unknown = JSON.parse(localStorage.getItem('samou_active_zone') ?? 'null');
    if (
      !zone ||
      typeof zone !== 'object' ||
      !('id' in zone) ||
      typeof zone.id !== 'string' ||
      !('nameAr' in zone) ||
      typeof zone.nameAr !== 'string' ||
      !('nameEn' in zone) ||
      typeof zone.nameEn !== 'string' ||
      !('deliveryFee' in zone) ||
      typeof zone.deliveryFee !== 'number' ||
      !('fee' in zone) ||
      typeof zone.fee !== 'number' ||
      !('allowCaptainPricing' in zone) ||
      typeof zone.allowCaptainPricing !== 'boolean' ||
      !('isActive' in zone) ||
      zone.isActive !== true ||
      !('sortOrder' in zone) ||
      typeof zone.sortOrder !== 'number'
    )
      return null;
    return {
      id: zone.id,
      nameAr: zone.nameAr,
      nameEn: zone.nameEn,
      deliveryFee: zone.deliveryFee,
      fee: zone.fee,
      allowCaptainPricing: zone.allowCaptainPricing,
      isActive: true,
      sortOrder: zone.sortOrder,
    };
  } catch {
    return null;
  }
}
const ZoneContext = createContext<ZoneState | null>(null);
export function ZoneProvider({ children }: { children: ReactNode }) {
  const [zones, setZones] = useState<DeliveryZone[]>(() => {
    const cached = readCachedZone();
    return cached ? [cached] : [];
  });
  const [activeZone, setActiveZone] = useState<DeliveryZone | null>(readCachedZone);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const selectedId = useRef(activeZone?.id ?? null);
  const selectZone = (id: string) => {
    const zone = zones.find(zone => zone.id === id) ?? null;
    selectedId.current = zone?.id ?? null;
    setActiveZone(zone);
    try {
      if (zone) {
        localStorage.setItem('samou_active_zone', JSON.stringify(zone));
        localStorage.setItem('samou_selected_zone', zone.id);
      } else {
        localStorage.removeItem('samou_active_zone');
        localStorage.removeItem('samou_selected_zone');
      }
    } catch {
      /* Private browsing still keeps the selection in memory. */
    }
  };
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError('');
    const load = async (): Promise<DeliveryZone[]> => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await listActiveDeliveryZones(controller.signal);
        } catch (cause) {
          const retryable = cause instanceof ApiError && !cause.isAborted &&
            (!cause.status || cause.status >= 500 || cause.status === 429);
          if (!active || !retryable || attempt >= 2) throw cause;
          await new Promise<void>(resolve => {
            const finish = () => {
              clearTimeout(retryTimer);
              controller.signal.removeEventListener('abort', finish);
              resolve();
            };
            retryTimer = setTimeout(finish, (attempt + 1) * 1500);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
          if (controller.signal.aborted) throw cause;
        }
      }
    };
    load()
      .then(rows => {
        if (!active) return;
        setZones(rows);
        let id: string | null = selectedId.current;
        try {
          id =
            id ?? JSON.parse(localStorage.getItem('samou_active_zone') ?? 'null')?.id ??
            localStorage.getItem('samou_selected_zone');
        } catch {
          /* Ignore invalid cache. */
        }
        const zone = rows.find(row => row.id === id) ?? null;
        selectedId.current = zone?.id ?? null;
        setActiveZone(zone);
        try {
          if (zone) localStorage.setItem('samou_active_zone', JSON.stringify(zone));
          else {
            localStorage.removeItem('samou_active_zone');
            localStorage.removeItem('samou_selected_zone');
          }
        } catch {
          /* Optional persistence. */
        }
      })
      .catch(() => {
        if (active) setError('تعذر تحميل مناطق التوصيل');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [revision]);
  useEffect(() => {
    const reconnect = () => setRevision(value => value + 1);
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, []);
  return (
    <ZoneContext.Provider
      value={{
        zones,
        activeZone,
        loading,
        error,
        selectZone,
        reload: () => setRevision(value => value + 1),
      }}
    >
      {children}
    </ZoneContext.Provider>
  );
}
export function useDeliveryZone() {
  const value = useContext(ZoneContext);
  if (!value) throw new Error('ZoneProvider is required');
  return value;
}
export function ZoneSelector({ compact = false }: { compact?: boolean }) {
  const zone = useDeliveryZone();
  return (
    <label className={compact ? "home-zone block min-w-0 flex-1 text-xs font-medium text-ink-muted" : "block text-sm font-bold"}>
      منطقة التوصيل
      <select
        aria-label="منطقة التوصيل"
        className={compact ? "mt-0 min-h-11 w-full rounded-xl border-0 bg-transparent pe-6 text-sm font-bold text-ink focus-visible:ring-2 focus-visible:ring-brand" : "mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-ink"}
        value={zone.activeZone?.id ?? ''}
        onChange={event => zone.selectZone(event.target.value)}
        disabled={zone.loading}
      >
        <option value="">{zone.loading ? 'جارٍ تحميل المناطق...' : 'اختر منطقتك'}</option>
        {zone.zones.map(item => (
          <option key={item.id} value={item.id}>
            {item.nameAr}
          </option>
        ))}
      </select>
      {zone.error && (
        <button type="button" className="mt-2 min-h-11 text-danger-ink" onClick={zone.reload}>
          {zone.error} — إعادة المحاولة
        </button>
      )}
      {!zone.loading && !zone.error && !zone.zones.length && (
        <p className="mt-2">لا توجد مناطق متاحة حالياً</p>
      )}
    </label>
  );
}
