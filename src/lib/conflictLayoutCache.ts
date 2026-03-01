import { buildConflictLayoutCacheKey } from "./cacheKeys";
import { computeLayoutTableData } from "./layoutTable";
import { incrementPerfCounter, startPerfSpan } from "./perf";
import { createTtlCache } from "./ttlCache";
import type { Conflict, TableData } from "./types";

export type ConflictTableLayoutInput = {
    layout: number;
    columns: string[];
    sort: string;
    order: string;
};

type LayoutCacheEntry = {
    sourceKey: string;
    value: TableData;
};

const MAX_LAYOUT_CACHE_ENTRIES = 80;
const LAYOUT_CACHE_TTL_MS = 8 * 60 * 1000;

const layoutCacheByKey = createTtlCache<string, LayoutCacheEntry>({
    ttlMs: LAYOUT_CACHE_TTL_MS,
    maxEntries: MAX_LAYOUT_CACHE_ENTRIES,
    hooks: {
        onHit() {
            incrementPerfCounter("conflict.layout.cache.hit", 1, {
                owner: "conflictLayoutCache",
            });
        },
        onMiss() {
            incrementPerfCounter("conflict.layout.cache.miss", 1, {
                owner: "conflictLayoutCache",
            });
        },
        onEvict() {
            incrementPerfCounter("conflict.layout.cache.evict", 1, {
                reason: "max-entries",
            });
        },
        onInvalidate(_key, _value, reason) {
            incrementPerfCounter("conflict.layout.cache.invalidate", 1, {
                reason,
            });
        },
    },
});

export function getOrComputeConflictTableData(
    sourceKey: string,
    rawData: Conflict,
    input: ConflictTableLayoutInput,
): TableData {
    layoutCacheByKey.evictExpired();

    const cacheKey = buildConflictLayoutCacheKey(sourceKey, input);
    const cached = layoutCacheByKey.get(cacheKey);
    if (cached) return cached.value;

    const finishSpan = startPerfSpan("conflict.layout.compute", {
        layout: input.layout,
        sort: input.sort,
        order: input.order,
        columns: input.columns.length,
    });

    const computed = computeLayoutTableData(
        rawData,
        input.layout,
        input.columns,
        input.sort,
        input.order,
    );

    finishSpan();

    layoutCacheByKey.set(cacheKey, {
        sourceKey,
        value: computed,
    });

    return computed;
}

export function warmConflictTableLayouts(
    sourceKey: string,
    rawData: Conflict,
    layouts: ConflictTableLayoutInput[],
): void {
    for (const input of layouts) {
        getOrComputeConflictTableData(sourceKey, rawData, input);
    }
}

export function invalidateConflictLayouts(options?: {
    sourceKey?: string;
    reason?: string;
    predicate?: (sourceKey: string) => boolean;
}): void {
    if (layoutCacheByKey.size === 0) return;

    const reason = options?.reason ?? "manual";
    const sourceKey = options?.sourceKey;
    const predicate = options?.predicate;

    let removed = 0;
    for (const [key, entry] of layoutCacheByKey.entries()) {
        const matchesSource = sourceKey ? entry.sourceKey === sourceKey : true;
        const matchesPredicate = predicate ? predicate(entry.sourceKey) : true;
        if (!matchesSource || !matchesPredicate) continue;
        layoutCacheByKey.delete(key);
        removed += 1;
    }

    if (removed > 0) {
        incrementPerfCounter("conflict.layout.cache.invalidate", removed, {
            reason,
        });
    }
}
