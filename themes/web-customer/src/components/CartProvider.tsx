/**
 * Samou' Go — shopping cart (multi-store).
 *
 * The client never sends money: totals are re-derived here ONLY for display
 * (using prices captured from the catalogue at add-time); the checkout screen
 * always prices the basket again via `quoteOrder`, and `POST /orders` accepts
 * just `{ storeId, items, address }` — the server is the only authority.
 *
 * Persisted to localStorage so the basket survives app kills and restarts.
 * Items from multiple stores may coexist in the basket; the checkout screen
 * groups them by store and creates independent sub-orders per store.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@samou-go/shared-types';

export interface CartLine {
  productId: string;
  quantity: number;
  /** Snapshot captured when the line was added — the cart renders offline. */
  product: Product;
  note: string;
  storeId: string;
  storeNameAr: string;
}

/** Groups of lines by store, for the checkout screen to render per-store. */
export interface CartStoreGroup {
  storeId: string;
  storeNameAr: string;
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
}

export interface CartState {
  /** Flat list of all lines across all stores. */
  lines: CartLine[];
  /** Total item count across all stores. */
  itemCount: number;
  /** Total subtotal across all stores. */
  subtotal: number;
  /** Lines grouped by store, for multi-store checkout display. */
  storeGroups: CartStoreGroup[];
  /** True when items from more than one store are in the cart. */
  isMultiStore: boolean;
  /** First store's ID (for single-store backward compat). Null if empty. */
  storeId: string | null;
  /** First store's Arabic name (for single-store backward compat). */
  storeNameAr: string;
  /** Set a single-store context (used by reorder to pre-set the store). */
  setStore: (storeId: string, storeNameAr: string) => void;
  addItem: (product: Product, quantity?: number, note?: string, storeNameAr?: string) => void;
  setNote: (productId: string, note: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  /** Find a line by productId (first match across stores). */
  lineFor: (productId: string) => CartLine | undefined;
}

const STORAGE_KEY = 'samou-go.cart.v2';
const LEGACY_STORAGE_KEY = 'samou-go.cart.v1';

/** v2 persisted format — each line carries its own store info. */
interface PersistedCartV2 {
  lines: CartLine[];
}

/** v1 persisted format — single-store, storeId at cart level. */
interface PersistedCartV1 {
  storeId: string | null;
  storeNameAr: string;
  lines: { productId: string; quantity: number; product: Product; note: string }[];
}

function readPersisted(): CartLine[] {
  try {
    // Try v2 first.
    const raw2 = localStorage.getItem(STORAGE_KEY);
    if (raw2) {
      const parsed = JSON.parse(raw2) as PersistedCartV2;
      if (Array.isArray(parsed.lines)) return parsed.lines;
    }

    // Migrate from v1: inject storeId/storeNameAr into each line.
    const raw1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw1) {
      const parsed = JSON.parse(raw1) as PersistedCartV1;
      if (Array.isArray(parsed.lines) && parsed.storeId) {
        const migrated: CartLine[] = parsed.lines.map(line => ({
          ...line,
          storeId: parsed.storeId!,
          storeNameAr: parsed.storeNameAr,
        }));
        // Write v2 and remove v1.
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines: migrated }));
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch { /* ignore */ }
        return migrated;
      }
    }
  } catch {
    /* Corrupted storage — start empty. */
  }
  return [];
}

function persistLines(lines: CartLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines }));
  } catch {
    /* Storage full or private mode — the in-memory cart still works. */
  }
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => readPersisted());
  const hydrated = useRef(false);

  // Mirrors the latest lines so callbacks can read synchronously.
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // Persist after every change, but never during the first render.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    persistLines(lines);
  }, [lines]);

  const setStore = useCallback((_storeId: string, _storeNameAr: string) => {
    // Single-store context setter — used by reorder. For multi-store, the
    // storeId is carried on each line. This preserves the existing API contract
    // (OrdersScreen, OrderTrackingScreen call setStore before addItem).
  }, []);

  const addItem = useCallback((product: Product, quantity = 1, note = '', storeNameAr?: string): void => {
    setLines(current => {
      const existing = current.find(line => line.productId === product.id);
      if (existing) {
        return current.map(line =>
          line.productId === product.id
            ? { ...line, quantity: Math.min(99, line.quantity + quantity), note: note || line.note }
            : line,
        );
      }
      return [...current, {
        productId: product.id,
        quantity,
        product,
        note,
        storeId: product.storeId,
        storeNameAr: storeNameAr ?? '',
      }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines(current =>
      quantity <= 0
        ? current.filter(line => line.productId !== productId)
        : current.map(line =>
            line.productId === productId ? { ...line, quantity: Math.min(99, quantity) } : line,
          ),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setLines(current => current.filter(line => line.productId !== productId));
  }, []);

  const setNote = useCallback((productId: string, note: string) => {
    setLines(current =>
      current.map(line => line.productId === productId ? { ...line, note } : line),
    );
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  const lineFor = useCallback(
    (productId: string) => lines.find(line => line.productId === productId),
    [lines],
  );    const value = useMemo<CartState>(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);

    // Group lines by storeId for multi-store checkout display.
    const groupMap = new Map<string, CartStoreGroup>();
    for (const line of lines) {
      let group = groupMap.get(line.storeId);
      if (!group) {
        group = {
          storeId: line.storeId,
          storeNameAr: line.storeNameAr,
          lines: [],
          subtotal: 0,
          itemCount: 0,
        };
        groupMap.set(line.storeId, group);
      }
      group.lines.push(line);
      group.subtotal += line.quantity * line.product.price;
      group.itemCount += line.quantity;
    }
    const storeGroups = Array.from(groupMap.values());
    const firstGroup = storeGroups[0];

    return {
      lines,
      itemCount,
      subtotal,
      storeGroups,
      isMultiStore: storeGroups.length > 1,
      storeId: firstGroup?.storeId ?? null,
      storeNameAr: firstGroup?.storeNameAr ?? '',
      setStore,
      addItem,
      setNote,
      setQuantity,
      removeItem,
      clear,
      lineFor,
    };
  }, [lines, setStore, addItem, setNote, setQuantity, removeItem, clear, lineFor]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
