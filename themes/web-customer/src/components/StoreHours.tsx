import type { Store } from '@samou-go/shared-types';
export function storeIsOpen(
  store: Pick<Store, 'isActive' | 'isAcceptingOrders' | 'storeStatus'>
): boolean {
  return store.isActive && store.isAcceptingOrders && store.storeStatus !== 'CLOSED';
}
export function StoreHours({ store }: { store: Store }) {
  if (!store.openingTime) return null;
  return (
    <p className="mt-1 text-xs text-ink-muted">
      {storeIsOpen(store) ? 'ساعات العمل' : 'مغلق الآن — موعد الفتح المعتاد'}{' '}
      <span dir="ltr">
        {store.openingTime}
        {storeIsOpen(store) && store.closingTime ? ` – ${store.closingTime}` : ''}
      </span>
    </p>
  );
}
