import { buildCompositeContextCacheKey } from "./cacheKeys";
import { incrementPerfCounter } from "./perf";
import { createTtlCache } from "./ttlCache";

export type CompositeContextCacheKey = `${string}|aid:${number}|v:${string}`;

type CompositeEntry<T> = {
    sourceSignature: string;
    selectedAllianceId: number;
    value: Promise<T>;
};

const MAX_COMPOSITE_CONTEXT_ENTRIES = 20;
const COMPOSITE_CONTEXT_TTL_MS = 6 * 60 * 1000;

const compositeContextByKey = createTtlCache<
    CompositeContextCacheKey,
    CompositeEntry<unknown>
>({
    ttlMs: COMPOSITE_CONTEXT_TTL_MS,
    maxEntries: MAX_COMPOSITE_CONTEXT_ENTRIES,
    hooks: {
        onHit() {
            incrementPerfCounter("composite.context.cache.hit", 1, {
                owner: "compositeContextCache",
            });
        },
        onMiss() {
            incrementPerfCounter("composite.context.cache.miss", 1, {
                owner: "compositeContextCache",
            });
        },
        onEvict() {
            incrementPerfCounter("composite.context.cache.evict", 1, {
                reason: "max-entries",
            });
        },
        onInvalidate(_key, _value, reason) {
            incrementPerfCounter("composite.context.cache.invalidate", 1, {
                reason,
            });
        },
    },
});

export function makeCompositeContextCacheKey(
    signature: string,
    selectedAllianceId: number,
    conflictDataVersion: string | number,
): CompositeContextCacheKey {
    return buildCompositeContextCacheKey(
        signature,
        selectedAllianceId,
        String(conflictDataVersion),
    );
}

export function getOrLoadCompositeContext<T>(
    key: CompositeContextCacheKey,
    sourceSignature: string,
    selectedAllianceId: number,
    load: () => Promise<T>,
): Promise<T> {
    compositeContextByKey.evictExpired();

    const existing = compositeContextByKey.get(key) as CompositeEntry<T> | undefined;
    if (existing) {
        return existing.value;
    }

    const promise = load().catch((error) => {
        compositeContextByKey.delete(key);
        throw error;
    });

    compositeContextByKey.set(key, {
        sourceSignature,
        selectedAllianceId,
        value: promise,
    });
    return promise;
}

export function invalidateCompositeContexts(options?: {
    sourceSignature?: string;
    selectedAllianceId?: number;
    reason?: string;
}): void {
    const signature = options?.sourceSignature;
    const selectedAllianceId = options?.selectedAllianceId;
    const reason = options?.reason ?? "manual";

    let removed = 0;
    for (const [key, entry] of compositeContextByKey.entries()) {
        if (signature && entry.sourceSignature !== signature) continue;
        if (
            typeof selectedAllianceId === "number" &&
            entry.selectedAllianceId !== selectedAllianceId
        ) {
            continue;
        }
        compositeContextByKey.delete(key);
        removed += 1;
    }

    if (removed > 0) {
        incrementPerfCounter("composite.context.cache.invalidate", removed, {
            reason,
        });
    }
}
