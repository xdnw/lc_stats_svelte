import { incrementPerfCounter } from "./perf";
import { createTtlCache } from "./ttlCache";

export type Trace = {
    x: number[];
    y: number[];
    customdata: number[];
    id: number[];
    text: string[];
    marker: { size: number[] };
};

export type Range = {
    x: number[];
    y: number[];
    z: number[];
};

export type Timeframe = {
    start: number;
    end: number;
    is_turn: boolean;
};

export type TraceBuildResult = {
    traces: { [key: number]: { [key: number]: Trace } };
    times: Timeframe;
    ranges: Range;
};

export type TieringDataSet = {
    group: number;
    label: string;
    color: string;
    data: number[][];
};

export type TieringDataSetResponse = {
    data: TieringDataSet[];
    city_range: [number, number];
    city_labels?: (string | number)[];
    time: [number, number];
    is_turn: boolean;
};

type GraphCacheEntry<T> = {
    value: T;
    family: "bubble" | "tiering";
};

const MAX_GRAPH_DERIVED_ENTRIES = 60;
const GRAPH_DERIVED_TTL_MS = 8 * 60 * 1000;

const graphDerivedByKey = createTtlCache<
    string,
    GraphCacheEntry<TraceBuildResult | TieringDataSetResponse>
>({
    ttlMs: GRAPH_DERIVED_TTL_MS,
    maxEntries: MAX_GRAPH_DERIVED_ENTRIES,
    hooks: {
        onEvict() {
            incrementPerfCounter("graph.derived.cache.evict", 1, {
                reason: "max-entries",
            });
        },
        onInvalidate(_key, value, reason) {
            incrementPerfCounter(`graph.${value.family}.cache.invalidate`, 1, {
                reason,
            });
        },
    },
});

const bubbleDatasetReadyByKey = new Map<string, Promise<void>>();
const tieringDatasetReadyByKey = new Map<string, Promise<void>>();
const latestRequestIdByContext = new Map<string, number>();

function bubbleGraphKey(cacheKey: string): string {
    return `bubble:${cacheKey}`;
}

function tieringGraphKey(cacheKey: string): string {
    return `tiering:${cacheKey}`;
}

function markContextRequest(contextKey: string | null | undefined, requestId: number | null | undefined): void {
    if (!contextKey || requestId == null) return;
    latestRequestIdByContext.set(contextKey, requestId);
}

function isStaleContextRequest(
    contextKey: string | null | undefined,
    requestId: number | null | undefined,
): boolean {
    if (!contextKey || requestId == null) return false;
    const latest = latestRequestIdByContext.get(contextKey);
    return typeof latest === "number" && requestId < latest;
}

function storeBubbleTrace(cacheKey: string, value: TraceBuildResult): void {
    graphDerivedByKey.set(bubbleGraphKey(cacheKey), {
        value,
        family: "bubble",
    });
}

function storeTieringDataset(cacheKey: string, value: TieringDataSetResponse): void {
    graphDerivedByKey.set(tieringGraphKey(cacheKey), {
        value,
        family: "tiering",
    });
}

export function ensureBubbleDatasetReady(
    datasetKey: string,
    init: () => Promise<void>,
): Promise<void> {
    const existing = bubbleDatasetReadyByKey.get(datasetKey);
    if (existing) return existing;

    const created = init().catch((error) => {
        bubbleDatasetReadyByKey.delete(datasetKey);
        throw error;
    });
    bubbleDatasetReadyByKey.set(datasetKey, created);
    return created;
}

export function ensureTieringDatasetReady(
    datasetKey: string,
    init: () => Promise<void>,
): Promise<void> {
    const existing = tieringDatasetReadyByKey.get(datasetKey);
    if (existing) return existing;

    const created = init().catch((error) => {
        tieringDatasetReadyByKey.delete(datasetKey);
        throw error;
    });
    tieringDatasetReadyByKey.set(datasetKey, created);
    return created;
}

export function clearDatasetReadyHandle(options?: {
    family?: "bubble" | "tiering";
    datasetKey?: string;
}): void {
    const family = options?.family;
    const datasetKey = options?.datasetKey;

    if (!family || family === "bubble") {
        if (datasetKey) bubbleDatasetReadyByKey.delete(datasetKey);
        else bubbleDatasetReadyByKey.clear();
    }

    if (!family || family === "tiering") {
        if (datasetKey) tieringDatasetReadyByKey.delete(datasetKey);
        else tieringDatasetReadyByKey.clear();
    }
}

export function getBubbleTrace(cacheKey: string): TraceBuildResult | null {
    graphDerivedByKey.evictExpired();
    const entry = graphDerivedByKey.get(bubbleGraphKey(cacheKey));
    if (!entry || entry.family !== "bubble") {
        incrementPerfCounter("graph.bubble.cache.miss", 1, {
            owner: "graphDerivedCache",
        });
        return null;
    }

    incrementPerfCounter("graph.bubble.cache.hit", 1, {
        owner: "graphDerivedCache",
    });
    return entry.value as TraceBuildResult;
}

export async function warmBubbleDefaultTrace(options: {
    cacheKey: string;
    compute: () => Promise<TraceBuildResult | null>;
    contextKey?: string;
    requestId?: number;
}): Promise<TraceBuildResult | null> {
    markContextRequest(options.contextKey, options.requestId);

    const cached = getBubbleTrace(options.cacheKey);
    if (cached) return cached;

    const computed = await options.compute();
    if (!computed) return null;
    if (isStaleContextRequest(options.contextKey, options.requestId)) {
        incrementPerfCounter("graph.bubble.cache.drop", 1, {
            reason: "stale-context",
        });
        return computed;
    }

    storeBubbleTrace(options.cacheKey, computed);
    return computed;
}

export function getTieringDataset(cacheKey: string): TieringDataSetResponse | null {
    graphDerivedByKey.evictExpired();
    const entry = graphDerivedByKey.get(tieringGraphKey(cacheKey));
    if (!entry || entry.family !== "tiering") {
        incrementPerfCounter("graph.tiering.cache.miss", 1, {
            owner: "graphDerivedCache",
        });
        return null;
    }

    incrementPerfCounter("graph.tiering.cache.hit", 1, {
        owner: "graphDerivedCache",
    });
    return entry.value as TieringDataSetResponse;
}

export async function warmTieringDefaultDataset(options: {
    cacheKey: string;
    compute: () => Promise<TieringDataSetResponse | null>;
    contextKey?: string;
    requestId?: number;
}): Promise<TieringDataSetResponse | null> {
    markContextRequest(options.contextKey, options.requestId);

    const cached = getTieringDataset(options.cacheKey);
    if (cached) return cached;

    const computed = await options.compute();
    if (!computed) return null;
    if (isStaleContextRequest(options.contextKey, options.requestId)) {
        incrementPerfCounter("graph.tiering.cache.drop", 1, {
            reason: "stale-context",
        });
        return computed;
    }

    storeTieringDataset(options.cacheKey, computed);
    return computed;
}

export function invalidateGraphDerived(options?: {
    family?: "bubble" | "tiering";
    keyPrefix?: string;
    reason?: string;
}): void {
    const family = options?.family;
    const keyPrefix = options?.keyPrefix;
    const reason = options?.reason ?? "manual";

    if (!family || family === "bubble") {
        for (const key of graphDerivedByKey.keys()) {
            if (!key.startsWith("bubble:")) continue;
            const cacheKey = key.slice("bubble:".length);
            if (keyPrefix && !cacheKey.startsWith(keyPrefix)) continue;
            graphDerivedByKey.delete(key);
            incrementPerfCounter("graph.bubble.cache.invalidate", 1, { reason });
        }
    }

    if (!family || family === "tiering") {
        for (const key of graphDerivedByKey.keys()) {
            if (!key.startsWith("tiering:")) continue;
            const cacheKey = key.slice("tiering:".length);
            if (keyPrefix && !cacheKey.startsWith(keyPrefix)) continue;
            graphDerivedByKey.delete(key);
            incrementPerfCounter("graph.tiering.cache.invalidate", 1, { reason });
        }
    }
}
