/**
 * O(1) get/set LRU cache using insertion order; optional dispose on eviction.
 */
export function createLruStore<T>(limit: number, dispose?: (value: T) => void) {
  const items = new Map<string, T>();

  function remove(key: string) {
    const value = items.get(key);
    if (value == null) return;
    items.delete(key);
    dispose?.(value);
  }

  function evict() {
    while (items.size > limit) {
      const key = items.keys().next().value;
      if (key == null) break;
      remove(key);
    }
  }

  return {
    get(key: string) {
      const value = items.get(key);
      if (value == null) return undefined;
      items.delete(key);
      items.set(key, value);
      return value;
    },
    set(key: string, value: T) {
      if (items.has(key)) items.delete(key);
      items.set(key, value);
      evict();
    },
    has(key: string) {
      return items.has(key);
    },
    delete(key: string) {
      remove(key);
    },
    /** Remove every entry, invoking `dispose` for each (if set). */
    clear() {
      for (const key of [...items.keys()]) {
        remove(key);
      }
    },
    get size() {
      return items.size;
    }
  };
}

export type LruStore<T> = ReturnType<typeof createLruStore<T>>;
