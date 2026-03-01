import { nowMs } from "./time";

type TtlCacheReason = "expired" | "max-entries" | "manual";

export type TtlCacheHooks<K, V> = {
    onHit?: (key: K, value: V) => void;
    onMiss?: (key: K) => void;
    onSet?: (key: K, value: V) => void;
    onEvict?: (key: K, value: V, reason: TtlCacheReason) => void;
    onInvalidate?: (key: K, value: V, reason: TtlCacheReason) => void;
};

type TtlCacheEntry<V> = {
    value: V;
    expiresAt: number;
    lastAccessMs: number;
};

export type TtlCacheConfig<K, V> = {
    ttlMs: number;
    maxEntries: number;
    hooks?: TtlCacheHooks<K, V>;
};

export function createTtlCache<K, V>(config: TtlCacheConfig<K, V>) {
    const map = new Map<K, TtlCacheEntry<V>>();
    const hooks = config.hooks;

    function get(key: K, now: number = nowMs()): V | undefined {
        const entry = map.get(key);
        if (!entry) {
            hooks?.onMiss?.(key);
            return undefined;
        }

        if (entry.expiresAt <= now) {
            map.delete(key);
            hooks?.onInvalidate?.(key, entry.value, "expired");
            hooks?.onMiss?.(key);
            return undefined;
        }

        entry.lastAccessMs = now;
        hooks?.onHit?.(key, entry.value);
        return entry.value;
    }

    function set(key: K, value: V, now: number = nowMs()): void {
        map.set(key, {
            value,
            expiresAt: now + config.ttlMs,
            lastAccessMs: now,
        });
        hooks?.onSet?.(key, value);
        enforceLimit();
    }

    function del(key: K): boolean {
        return map.delete(key);
    }

    function clear(): void {
        map.clear();
    }

    function evictExpired(now: number = nowMs()): number {
        let removed = 0;
        for (const [key, entry] of map.entries()) {
            if (entry.expiresAt > now) continue;
            map.delete(key);
            removed += 1;
            hooks?.onInvalidate?.(key, entry.value, "expired");
        }
        return removed;
    }

    function enforceLimit(): number {
        if (map.size <= config.maxEntries) return 0;

        const entries = Array.from(map.entries()).sort(
            (left, right) => left[1].lastAccessMs - right[1].lastAccessMs,
        );

        const removeCount = map.size - config.maxEntries;
        for (let i = 0; i < removeCount; i += 1) {
            const entry = entries[i];
            if (!entry) continue;
            map.delete(entry[0]);
            hooks?.onEvict?.(entry[0], entry[1].value, "max-entries");
        }
        return removeCount;
    }

    function entries(): IterableIterator<[K, V]> {
        const rawEntries = map.entries();
        return {
            [Symbol.iterator]() {
                return this;
            },
            next(): IteratorResult<[K, V]> {
                const nextEntry = rawEntries.next();
                if (nextEntry.done) return { done: true, value: undefined as never };
                return {
                    done: false,
                    value: [nextEntry.value[0], nextEntry.value[1].value],
                };
            },
        };
    }

    function keys(): IterableIterator<K> {
        return map.keys();
    }

    return {
        get,
        set,
        delete: del,
        clear,
        evictExpired,
        enforceLimit,
        entries,
        keys,
        get size() {
            return map.size;
        },
    };
}