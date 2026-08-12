/**
 * Samou' Go — shopping cart for the consolidated customer journey.
 *
 * The client never sends money: totals are re-derived here ONLY for display
 * (using prices captured from the catalogue at add-time); the checkout screen
 * always prices the basket again via `quoteOrder`, and `POST /orders` accepts
 * just `{ storeId, items, address }` — the server is the only authority.
 *
 * Persisted to localStorage so the basket survives app kills and restarts.
 * The basket is scoped to one store at a time (an order belongs to one store);
 * adding from a different store asks the UI to confirm the replacement.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@samou-go/shared-types';

export interface CartLine {
  productId: string;
  quantity: number;
  /** Snapshot captured when the line was added — the cart renders offline. */
  product: Product;
  note: string;
}

export interface CartState {
  storeId: string | null;
  storeNameAr: string;
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  /** Basket is scoped to one store; set when switching store. */
  setStore: (storeId: string, storeNameAr: string) => void;
  addItem: (product: Product, quantity?: number, note?: string) => void;
  setNote: (productId: string, note: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  lineFor: (productId: string) => CartLine | undefined;
}

const STORAGE_KEY = 'samou-go.cart.v1';

interface PersistedCart {
  storeId: string | null;
  storeNameAr: string;
  lines: CartLine[];
}

function readPersisted(): PersistedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { storeId: null, storeNameAr: '', lines: [] };
    const parsed = JSON.parse(raw) as PersistedCart;
    if (!Array.isArray(parsed.lines)) return { storeId: null, storeNameAr: '', lines: [] };
    return parsed;
  } catch {
    return { storeId: null, storeNameAr: '', lines: [] };
  }
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<PersistedCart>(() => readPersisted());
  const hydrated = useRef(false);

  // Persist after every change, but never during the first render (React 18
  // strict-mode double-render would otherwise re-run the reader).
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* Storage full or private mode — the in-memory cart still works. */
    }
  }, [cart]);

  const setStore = useCallback((storeId: string, storeNameAr: string) => {
    setCart((current) =>
      current.storeId === storeId
        ? current
        : { storeId, storeNameAr, lines: current.storeId === null ? current.lines : [] }
    );
  }, []);

  const addItem = useCallback((product: Product, quantity = 1, note = '') => {
    setCart((current) => {
      const base: PersistedCart = {
        storeId: current.storeId ?? product.storeId,
        storeNameAr: current.storeNameAr,
        lines: current.storeId && current.storeId !== product.storeId ? [] : current.lines,
      };
      const existing = base.lines.find((line) => line.productId === product.id);
      const lines = existing
        ? base.lines.map((line) =>
            line.productId === product.id
              ? { ...line, quantity: Math.min(99, line.quantity + quantity), note: note || line.note }
              : line
          )
        : [...base.lines, { productId: product.id, quantity, product, note }];
      return { ...base, lines };
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((current) => ({
      ...current,
      lines:
        quantity <= 0
          ? current.lines.filter((line) => line.productId !== productId)
          : current.lines.map((line) =>
              line.productId === productId
                ? { ...line, quantity: Math.min(99, quantity) }
                : line
            ),
    }));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCart((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.productId !== productId),
    }));
  }, []);

  const setNote = useCallback((productId: string, note: string) => {
    setCart((current) => ({ ...current, lines: current.lines.map((line) => line.productId === productId ? { ...line, note } : line) }));
  }, []);

  const clear = useCallback(() => {
    setCart({ storeId: null, storeNameAr: '', lines: [] });
  }, []);

  const lineFor = useCallback(
    (productId: string) => cart.lines.find((line) => line.productId === productId),
    [cart.lines]
  );

  const value = useMemo<CartState>(() => {
    const itemCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = cart.lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
    return {
      storeId: cart.storeId,
      storeNameAr: cart.storeNameAr,
      lines: cart.lines,
      itemCount,
      subtotal,
      setStore,
      addItem,
      setNote,
      setQuantity,
      removeItem,
      clear,
      lineFor,
    };
  }, [cart, setStore, addItem, setNote, setQuantity, removeItem, clear, lineFor]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
