/**
 * A map bounded to its `limit` most recently used entries. A hit moves the
 * entry to the end; a miss creates it and, when the map is full, evicts the
 * least recently used entry first (Map iteration order is insertion order).
 */
export function cachedRecent<K, V>(
  map: Map<K, V>,
  key: K,
  limit: number,
  create: () => V,
  evict: (value: V) => void,
): V {
  const cached = map.get(key);
  if (cached !== undefined) {
    map.delete(key);
    map.set(key, cached);
    return cached;
  }
  const value = create();
  while (map.size >= Math.max(1, limit)) {
    const [oldest, stale] = map.entries().next().value!;
    map.delete(oldest);
    evict(stale);
  }
  map.set(key, value);
  return value;
}
