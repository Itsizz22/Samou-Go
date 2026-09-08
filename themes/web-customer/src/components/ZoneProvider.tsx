import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { listActiveDeliveryZones } from '@samou-go/api-client';
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
  const selectZone = (id: string) => {
    const zone = zones.find(zone => zone.id === id) ?? null;
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
    setLoading(true);
    setError('');
    listActiveDeliveryZones()
      .then(rows => {
        if (!active) return;
        setZones(rows);
        let id: string | null = null;
        try {
          id =
            JSON.parse(localStorage.getItem('samou_active_zone') ?? 'null')?.id ??
            localStorage.getItem('samou_selected_zone');
        } catch {
          /* Ignore invalid cache. */
        }
        const zone = rows.find(row => row.id === id) ?? null;
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
    };
  }, [revision]);
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
export function ZoneSelector() {
  const zone = useDeliveryZone();
  return (
    <label className="block text-sm font-bold">
      منطقة التوصيل
      <select
        aria-label="منطقة التوصيل"
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-ink"
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
