import { incrementPerfCounter } from "./perf";
import { createTtlCache } from "./ttlCache";
import type { MetricTimeSeriesResult } from "./metricTimeCompute";

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
    family: "bubble" | "tiering" | "metric-time";
};

type GraphDerivedFamily = GraphCacheEntry<unknown>["family"];

const MAX_GRAPH_DERIVED_ENTRIES = 60;
const GRAPH_DERIVED_TTL_MS = 8 * 60 * 1000;

const graphDerivedByKey = createTtlCache<
    string,
    GraphCacheEntry<TraceBuildResult | TieringDataSetResponse | MetricTimeSeriesResult>
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

const pendingDerivedByGraphKey = new Map<
    string,
    Promise<TraceBuildResult | TieringDataSetResponse | MetricTimeSeriesResult | null>
>();
const latestRequestIdByContext = new Map<string, number>();

function bubbleGraphKey(cacheKey: string): string {
    return `bubble:${cacheKey}`;
}

function tieringGraphKey(cacheKey: string): string {
    return `tiering:${cacheKey}`;
}

function metricTimeGraphKey(cacheKey: string): string {
    return `metric-time:${cacheKey}`;
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

function storeMetricTimeSeries(
    cacheKey: string,
    value: MetricTimeSeriesResult,
): void {
    graphDerivedByKey.set(metricTimeGraphKey(cacheKey), {
        value,
        family: "metric-time",
    });
}

function peekGraphDerivedValue<T>(
    family: GraphDerivedFamily,
    cacheKey: string,
): T | null {
    graphDerivedByKey.evictExpired();
    const graphKey = family === "bubble"
        ? bubbleGraphKey(cacheKey)
        : family === "tiering"
          ? tieringGraphKey(cacheKey)
          : metricTimeGraphKey(cacheKey);
    const entry = graphDerivedByKey.get(graphKey);
    if (!entry || entry.family !== family) {
        return null;
    }

    return entry.value as T;
}

async function warmGraphDerivedValue<T>(options: {
    family: GraphDerivedFamily;
    cacheKey: string;
    contextKey?: string;
    requestId?: number;
    compute: () => Promise<T | null>;
    peek: (cacheKey: string) => T | null;
    store: (cacheKey: string, value: T) => void;
}): Promise<T | null> {
    markContextRequest(options.contextKey, options.requestId);

    const cached = options.peek(options.cacheKey);
    if (cached) {
        incrementPerfCounter(`graph.${options.family}.cache.hit`, 1, {
            owner: "warmGraphDerivedValue",
        });
        return cached;
    }

    const graphKey = options.family === "bubble"
        ? bubbleGraphKey(options.cacheKey)
        : options.family === "tiering"
          ? tieringGraphKey(options.cacheKey)
          : metricTimeGraphKey(options.cacheKey);
    const existing = pendingDerivedByGraphKey.get(graphKey);
    if (existing) {
        incrementPerfCounter(`graph.${options.family}.cache.pending`, 1, {
            owner: "warmGraphDerivedValue",
        });
        return existing as Promise<T | null>;
    }

    incrementPerfCounter(`graph.${options.family}.cache.miss`, 1, {
        owner: "warmGraphDerivedValue",
    });

    const created = options
        .compute()
        .then((computed) => {
            if (!computed) return null;
            if (isStaleContextRequest(options.contextKey, options.requestId)) {
                incrementPerfCounter(`graph.${options.family}.cache.drop`, 1, {
                    reason: "stale-context",
                });
                return computed;
            }

            options.store(options.cacheKey, computed);
            return computed;
        })
        .finally(() => {
            pendingDerivedByGraphKey.delete(graphKey);
        });

    pendingDerivedByGraphKey.set(
        graphKey,
        created as Promise<TraceBuildResult | TieringDataSetResponse | MetricTimeSeriesResult | null>,
    );
    return created;
}

export function hasBubbleTrace(cacheKey: string): boolean {
    return peekGraphDerivedValue<TraceBuildResult>("bubble", cacheKey) != null;
}

export function hasTieringDataset(cacheKey: string): boolean {
    return peekGraphDerivedValue<TieringDataSetResponse>("tiering", cacheKey) != null;
}

export function hasMetricTimeSeries(cacheKey: string): boolean {
    return peekGraphDerivedValue<MetricTimeSeriesResult>("metric-time", cacheKey) != null;
}

export function getBubbleTrace(cacheKey: string): TraceBuildResult | null {
    const value = peekGraphDerivedValue<TraceBuildResult>("bubble", cacheKey);
    if (!value) {
        incrementPerfCounter("graph.bubble.cache.miss", 1, {
            owner: "graphDerivedCache",
        });
        return null;
    }

    incrementPerfCounter("graph.bubble.cache.hit", 1, {
        owner: "graphDerivedCache",
    });
    return value;
}

export async function warmBubbleDefaultTrace(options: {
    cacheKey: string;
    compute: () => Promise<TraceBuildResult | null>;
    contextKey?: string;
    requestId?: number;
}): Promise<TraceBuildResult | null> {
    return warmGraphDerivedValue<TraceBuildResult>({
        family: "bubble",
        cacheKey: options.cacheKey,
        contextKey: options.contextKey,
        requestId: options.requestId,
        compute: options.compute,
        peek: (cacheKey) => peekGraphDerivedValue<TraceBuildResult>("bubble", cacheKey),
        store: storeBubbleTrace,
    });
}

export function recordBubbleTrace(
    cacheKey: string,
    value: TraceBuildResult,
): void {
    storeBubbleTrace(cacheKey, value);
}

export function getTieringDataset(cacheKey: string): TieringDataSetResponse | null {
    const value = peekGraphDerivedValue<TieringDataSetResponse>("tiering", cacheKey);
    if (!value) {
        incrementPerfCounter("graph.tiering.cache.miss", 1, {
            owner: "graphDerivedCache",
        });
        return null;
    }

    incrementPerfCounter("graph.tiering.cache.hit", 1, {
        owner: "graphDerivedCache",
    });
    return value;
}

export async function warmTieringDefaultDataset(options: {
    cacheKey: string;
    compute: () => Promise<TieringDataSetResponse | null>;
    contextKey?: string;
    requestId?: number;
}): Promise<TieringDataSetResponse | null> {
    return warmGraphDerivedValue<TieringDataSetResponse>({
        family: "tiering",
        cacheKey: options.cacheKey,
        contextKey: options.contextKey,
        requestId: options.requestId,
        compute: options.compute,
        peek: (cacheKey) =>
            peekGraphDerivedValue<TieringDataSetResponse>("tiering", cacheKey),
        store: storeTieringDataset,
    });
}

export function recordTieringDataset(
    cacheKey: string,
    value: TieringDataSetResponse,
): void {
    storeTieringDataset(cacheKey, value);
}

export function getMetricTimeSeries(
    cacheKey: string,
): MetricTimeSeriesResult | null {
    const value = peekGraphDerivedValue<MetricTimeSeriesResult>("metric-time", cacheKey);
    if (!value) {
        incrementPerfCounter("graph.metric-time.cache.miss", 1, {
            owner: "graphDerivedCache",
        });
        return null;
    }

    incrementPerfCounter("graph.metric-time.cache.hit", 1, {
        owner: "graphDerivedCache",
    });
    return value;
}

export async function warmMetricTimeSeries(options: {
    cacheKey: string;
    compute: () => Promise<MetricTimeSeriesResult | null>;
    contextKey?: string;
    requestId?: number;
}): Promise<MetricTimeSeriesResult | null> {
    return warmGraphDerivedValue<MetricTimeSeriesResult>({
        family: "metric-time",
        cacheKey: options.cacheKey,
        contextKey: options.contextKey,
        requestId: options.requestId,
        compute: options.compute,
        peek: (cacheKey) =>
            peekGraphDerivedValue<MetricTimeSeriesResult>("metric-time", cacheKey),
        store: storeMetricTimeSeries,
    });
}

export function recordMetricTimeSeries(
    cacheKey: string,
    value: MetricTimeSeriesResult,
): void {
    storeMetricTimeSeries(cacheKey, value);
}

export function invalidateGraphDerived(options?: {
    family?: "bubble" | "tiering" | "metric-time";
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

    if (!family || family === "metric-time") {
        for (const key of graphDerivedByKey.keys()) {
            if (!key.startsWith("metric-time:")) continue;
            const cacheKey = key.slice("metric-time:".length);
            if (keyPrefix && !cacheKey.startsWith(keyPrefix)) continue;
            graphDerivedByKey.delete(key);
            incrementPerfCounter("graph.metric-time.cache.invalidate", 1, { reason });
        }
    }
}

export type { MetricTimeSeriesResult } from "./metricTimeCompute";
