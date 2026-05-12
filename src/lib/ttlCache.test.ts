import { describe, expect, it } from "vitest";
import { createTtlCache } from "./ttlCache";

describe("ttlCache", () => {
    it("evicts the least recently used entry without sorting the full cache", () => {
        const evicted: string[] = [];
        const cache = createTtlCache<string, number>({
            ttlMs: 1000,
            maxEntries: 2,
            hooks: {
                onEvict(key) {
                    evicted.push(key);
                },
            },
        });

        cache.set("a", 1, 0);
        cache.set("b", 2, 1);
        expect(cache.get("a", 2)).toBe(1);

        cache.set("c", 3, 3);

        expect(evicted).toEqual(["b"]);
        expect(cache.has("a", 4)).toBe(true);
        expect(cache.has("b", 4)).toBe(false);
        expect(cache.has("c", 4)).toBe(true);
    });

    it("rate-limits full expired sweeps while still expiring requested keys", () => {
        const invalidated: string[] = [];
        const cache = createTtlCache<string, number>({
            ttlMs: 10,
            maxEntries: 10,
            expiredSweepIntervalMs: 100,
            hooks: {
                onInvalidate(key) {
                    invalidated.push(key);
                },
            },
        });

        cache.set("a", 1, 0);
        cache.set("b", 2, 0);

        expect(cache.evictExpired(20)).toBe(2);
        expect(invalidated).toEqual(["a", "b"]);

        cache.set("c", 3, 30);
        cache.set("d", 4, 30);

        expect(cache.evictExpired(50)).toBe(0);
        expect(cache.size).toBe(2);
        expect(cache.get("c", 50)).toBeUndefined();
        expect(cache.size).toBe(1);
        expect(invalidated).toEqual(["a", "b", "c"]);

        expect(cache.evictExpired(121)).toBe(1);
        expect(invalidated).toEqual(["a", "b", "c", "d"]);
        expect(cache.size).toBe(0);
    });
});
