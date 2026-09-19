import { createHash } from 'node:crypto';

/** Stable seeded shuffle within each store, then interleave stores fairly. */
export function mixCatalogue<T extends { id: string; storeId: string }>(items: T[], seed: string, perStore = Infinity): T[] {
  const score = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex');
  const ranked = items.map(item => ({ item, score: score(item.id) })).sort((a, b) => a.score.localeCompare(b.score) || a.item.id.localeCompare(b.item.id));
  const buckets = new Map<string, T[]>();
  for (const { item } of ranked) {
    const bucket = buckets.get(item.storeId) ?? [];
    if (bucket.length < perStore) bucket.push(item);
    buckets.set(item.storeId, bucket);
  }
  const stores = [...buckets.keys()].map(id => ({ id, score: score(`store:${id}`) })).sort((a, b) => a.score.localeCompare(b.score));
  const result: T[] = [];
  for (let round = 0; ; round += 1) {
    let added = false;
    for (const store of stores) {
      const item = buckets.get(store.id)?.[round];
      if (item) { result.push(item); added = true; }
    }
    if (!added) return result;
  }
}

export function dailyCatalogueSeed(): string { return new Date().toISOString().slice(0, 10); }
