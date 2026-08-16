/**
 * Address book — saved destinations for checkout.
 *
 * The API stores the address on each order (there is no shared address model),
 * so the saved list is client-side and per-device. Checkout reads it, prefills
 * the form, and offers the "Save for next time" toggle.
 */

export const ADDRESS_TAGS = ['home', 'work', 'other'] as const;
export type AddressTag = (typeof ADDRESS_TAGS)[number];

export const ADDRESS_TAG_META: Record<AddressTag, { ar: string; en: string }> = {
  home: { ar: 'المنزل', en: 'Home' },
  work: { ar: 'العمل', en: 'Work' },
  other: { ar: 'أخرى', en: 'Other' },
};

/** Fallback for older saved entries that predate tags. */
export function normalizeTag(tag: string | null | undefined): AddressTag {
  return tag && (ADDRESS_TAGS as readonly string[]).includes(tag) ? (tag as AddressTag) : 'other';
}

export interface SavedAddress {
  id: string;
  label: string;
  /** Home / Work / Other — free-form `label` stays for fine-tuning. */
  tag?: AddressTag;
  addressText: string;
  addressNote?: string;
  /** Optional WGS84 coordinates captured by the "use my location" flow. */
  lat?: number;
  lng?: number;
}

const STORAGE_KEY = 'samou-go.addresses.v1';

export function readSavedAddresses(): SavedAddress[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedAddress[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedAddresses(addresses: SavedAddress[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  } catch {
    /* private mode — addresses just won't persist */
  }
}

export function upsertAddress(addresses: SavedAddress[], address: SavedAddress): SavedAddress[] {
  const next = addresses.some((item) => item.id === address.id)
    ? addresses.map((item) => (item.id === address.id ? address : item))
    : [...addresses, address];
  return next.slice(-8);
}

export function removeAddress(addresses: SavedAddress[], id: string): SavedAddress[] {
  return addresses.filter((item) => item.id !== id);
}