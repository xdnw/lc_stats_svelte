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
    expiredSweepIntervalMs?: number;
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
        map.delete(key);
        map.set(key, entry);
        hooks?.onHit?.(key, entry.value);
        return entry.value;
    }

    function set(key: K, value: V, now: number = nowMs()): void {
        map.delete(key);
        map.set(key, {
            value,
            expiresAt: now + config.ttlMs,
            lastAccessMs: now,
        });
        hooks?.onSet?.(key, value);
        enforceLimit();
    }

    function has(key: K, now: number = nowMs()): boolean {
        const entry = map.get(key);
        if (!entry) return false;

        if (entry.expiresAt <= now) {
            map.delete(key);
            hooks?.onInvalidate?.(key, entry.value, "expired");
            return false;
        }

        return true;
    }

    function del(key: K): boolean {
        return map.delete(key);
    }

    function clear(): void {
        map.clear();
    }

    let lastExpiredSweepMs = Number.NEGATIVE_INFINITY;

    function evictExpired(now: number = nowMs()): number {
        const intervalMs = config.expiredSweepIntervalMs ?? 0;
        if (intervalMs > 0 && now - lastExpiredSweepMs < intervalMs) {
            return 0;
        }

        lastExpiredSweepMs = now;
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

        const removeCount = map.size - config.maxEntries;
        let removed = 0;
        for (const [key, entry] of map.entries()) {
            if (removed >= removeCount) break;
            map.delete(key);
            removed += 1;
            hooks?.onEvict?.(key, entry.value, "max-entries");
        }
        return removed;
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
        has,
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
