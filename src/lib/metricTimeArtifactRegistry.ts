import { appConfig as config } from "./appConfig";
import { loadCompressedPayloadBuffer } from "./binary";
import {
    buildCityRangeCacheKey,
    DEFAULT_CITY_RANGE,
    type CityRange,
} from "./cityRange";
import { loadConflictGraphPayload } from "./conflictGraphPayload";
import { buildConflictArtifactRegistryKey } from "./conflictArtifactKeys";
import {
    buildGraphRouteInfo,
    resolveMetricTimeAllowedAllianceIds,
    type GraphRouteInfo,
} from "./graphRouteInfo";
import {
    buildDefaultTieringAllianceIds,
    buildMetricTimeDatasetKey,
    buildMetricTimeSeriesCacheKey,
    buildSelectedAllianceIdsByCoalition,
} from "./graphArtifactKeys";
import {
    recordMetricTimeSeries,
    warmMetricTimeSeries,
    type MetricTimeSeriesResult,
} from "./graphDerivedCache";
import {
    buildDefaultMetricTimeMetric,
    resolveRequestedMetricTimeMetric,
} from "./metricTimeDefaults";
import { buildMetricTimeSeries } from "./metricTimeCompute";
import { incrementPerfCounter, recordPerfSpan } from "./perf";
import { getConflictGraphDataUrl } from "./runtime";
import type { GraphData, TierMetric } from "./types";
import { requestWorkerRpc } from "./workerRpc";
import type {
    MetricTimeVisibleBootstrapRequest,
    MetricTimeVisibleBootstrapResult,
} from "../workers/metricTimeWorker";
import type {
    WorkerDatasetComputeRequest,
    WorkerDatasetComputeResult,
    WorkerDatasetInitRequest,
    WorkerDatasetInitResult,
    WorkerTimingBreakdown,
    WorkerVisibleBootstrapTimingBreakdown,
} from "./workerDatasetProtocol";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "./bubbleAggregation";

const SHARED_GRAPH_WORKER_TTL_MS = 60_000;

type MetricTimeSeriesParams = {
    metric: TierMetric;
    aggregationMode?: BubbleAggregationMode;
    requestedAllianceIds?: number[] | null;
    selectedAllianceIds?: number[];
    cityRange?: CityRange;
};

type SharedMetricTimeHandle = {
    readonly datasetKey: string;
    readonly conflictId: string;
    readonly version: string | number;
    readonly hasWorker: boolean;
    acquire: () => void;
    release: () => void;
    scheduleReleaseIfIdle: () => void;
    bootstrapVisibleSeries: (options: {
        metric?: TierMetric | null;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange?: CityRange;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        series: MetricTimeSeriesResult | null;
        graphData?: GraphData;
    } | null>;
    getSeries: (options: {
        cacheKey: string;
        metric: TierMetric;
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange?: CityRange;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }) => Promise<MetricTimeSeriesResult | null>;
    warmDefaultSeries: (options?: {
        graphData?: GraphData;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        contextKey?: string;
        requestId?: number;
    }) => Promise<MetricTimeSeriesResult | null>;
};

export type MetricTimeArtifactHandle = {
    readonly conflictId: string;
    readonly version: string | number;
    readonly datasetKey: string;
    hasWorker: () => boolean;
    bootstrapVisibleSeries: (options: {
        metric?: TierMetric | null;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange?: CityRange;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        series: MetricTimeSeriesResult | null;
        graphData?: GraphData;
    } | null>;
    loadGraphData: () => Promise<GraphData>;
    getSeries: SharedMetricTimeHandle["getSeries"];
    warmDefaultSeries: SharedMetricTimeHandle["warmDefaultSeries"];
    destroy: () => void;
};

const metricTimeHandles = new Map<string, SharedMetricTimeHandle>();

function createMetricTimeWorker(): Worker | null {
    try {
        return new Worker(new URL("../workers/metricTimeWorker.ts", import.meta.url), {
            type: "module",
        });
    } catch (error) {
        console.warn("Metric time worker unavailable, using main-thread fallback", error);
        return null;
    }
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function recordVisibleBootstrapTiming(
    timings: WorkerVisibleBootstrapTimingBreakdown,
): void {
    incrementPerfCounter("worker.metric-time.bootstrap.receive.ms", timings.receiveMs);
    incrementPerfCounter("worker.metric-time.bootstrap.inflate.ms", timings.inflateMs);
    incrementPerfCounter("worker.metric-time.bootstrap.unpack.ms", timings.unpackMs);
    incrementPerfCounter("worker.metric-time.bootstrap.compute.ms", timings.computeMs);
    incrementPerfCounter("worker.metric-time.bootstrap.respond.ms", timings.respondMs);
    incrementPerfCounter("worker.metric-time.bootstrap.total.ms", timings.totalMs);
}

function recordWorkerTiming(
    timings: WorkerTimingBreakdown,
    roundTripStart: number,
): void {
    const roundTripEnd = nowMs();
    const roundTripMs = Math.max(0, roundTripEnd - roundTripStart);
    const cloneMs = Math.max(0, roundTripMs - timings.totalMs);
    incrementPerfCounter("worker.metric-time.receive.ms", timings.receiveMs);
    incrementPerfCounter("worker.metric-time.compute.ms", timings.computeMs);
    incrementPerfCounter("worker.metric-time.respond.ms", timings.respondMs);
    incrementPerfCounter("worker.metric-time.total.ms", timings.totalMs);
    incrementPerfCounter("worker.metric-time.clone.ms", cloneMs);
}

function createSharedMetricTimeHandle(options: {
    conflictId: string;
    version: string | number;
    onTerminate: () => void;
}): SharedMetricTimeHandle {
    const datasetKey = buildMetricTimeDatasetKey(options.conflictId, options.version);
    const worker = createMetricTimeWorker();
    const hasWorker = worker != null;
    const pendingVisibleSeriesByKey = new Map<
        string,
        Promise<{
            info: GraphRouteInfo;
            selectedAllianceIds: number[];
            cacheKey: string;
            series: MetricTimeSeriesResult | null;
            graphData?: GraphData;
        } | null>
    >();
    let datasetReadyPromise: Promise<void> | null = null;
    let datasetReady = false;
    let routeInfo: GraphRouteInfo | null = null;
    let released = false;
    let refCount = 0;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    function ensureActive(): void {
        if (released) {
            throw new Error("Conflict artifact handle has been released.");
        }
    }

    function clearReleaseTimer(): void {
        if (releaseTimer == null) return;
        clearTimeout(releaseTimer);
        releaseTimer = null;
    }

    function terminate(): void {
        if (released) return;
        released = true;
        clearReleaseTimer();
        datasetReadyPromise = null;
        datasetReady = false;
        routeInfo = null;
        worker?.terminate();
        options.onTerminate();
    }

    function scheduleReleaseIfIdle(): void {
        if (released || refCount > 0) return;
        clearReleaseTimer();
        releaseTimer = setTimeout(() => terminate(), SHARED_GRAPH_WORKER_TTL_MS);
    }

    function acquire(): void {
        ensureActive();
        refCount += 1;
        clearReleaseTimer();
    }

    function release(): void {
        if (released) return;
        refCount = Math.max(0, refCount - 1);
        scheduleReleaseIfIdle();
    }

    async function resolveGraphData(graphData?: GraphData): Promise<GraphData> {
        if (graphData) return graphData;
        return loadConflictGraphPayload({
            conflictId: options.conflictId,
            version: options.version,
        });
    }

    async function ensureDatasetReady(graphData?: GraphData): Promise<void> {
        ensureActive();
        if (!worker) return;
        if (datasetReady) return;
        if (datasetReadyPromise) return datasetReadyPromise;

        datasetReadyPromise = resolveGraphData(graphData)
            .then((data) =>
                requestWorkerRpc<
                    WorkerDatasetInitRequest<GraphData>,
                    WorkerDatasetInitResult
                >(
                    worker,
                    {
                        action: "init",
                        datasetKey,
                        data,
                    },
                    {
                        timeoutMs: 30_000,
                        operation: `${datasetKey} dataset init`,
                    },
                ).then(() => data),
            )
            .then((data) => {
                datasetReady = true;
                routeInfo = buildGraphRouteInfo(data);
            })
            .catch((error) => {
                datasetReadyPromise = null;
                datasetReady = false;
                throw error;
            });

        return datasetReadyPromise;
    }

    function request<Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs = 30_000,
        transfer?: Transferable[],
    ): Promise<Result> {
        ensureActive();
        if (!worker) {
            throw new Error(`Worker unavailable for ${operation}`);
        }
        return requestWorkerRpc<Request, Result>(worker, payload, {
            timeoutMs,
            operation,
            transfer,
        });
    }

    function runWhileAlive<T>(operation: () => Promise<T>): Promise<T> {
        ensureActive();
        clearReleaseTimer();
        return operation().finally(() => {
            scheduleReleaseIfIdle();
        });
    }

    function buildMetricTimeCacheKey(cacheOptions: {
        info: GraphRouteInfo;
        metric: TierMetric;
        selectedAllianceIds: number[];
        aggregationMode?: BubbleAggregationMode;
        cityRange?: CityRange;
    }): string {
        return buildMetricTimeSeriesCacheKey({
            conflictId: options.conflictId,
            graphVersion: options.version,
            metric: cacheOptions.metric,
            allianceIds: buildSelectedAllianceIdsByCoalition(
                cacheOptions.info,
                cacheOptions.selectedAllianceIds,
            ),
            defaultAllianceIds: buildDefaultTieringAllianceIds(cacheOptions.info),
            aggregationMode: cacheOptions.aggregationMode,
            cityRange: cacheOptions.cityRange,
        });
    }

    function normalizeRequestedAllianceIdsForKey(
        requestedAllianceIds?: number[] | null,
    ): number[] {
        if (!requestedAllianceIds || requestedAllianceIds.length === 0) {
            return [];
        }

        return Array.from(
            new Set(
                requestedAllianceIds
                    .map((id) => Math.trunc(Number(id)))
                    .filter((id) => Number.isFinite(id) && id > 0),
            ),
        ).sort((left, right) => left - right);
    }

    function buildMetricTimeBootstrapRequestKey(seriesOptions: {
        metric?: TierMetric | null;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange?: CityRange;
    }): string {
        const metricKey = seriesOptions.metric
            ? `${seriesOptions.metric.name}:${seriesOptions.metric.normalize ? 1 : 0}:${seriesOptions.metric.cumulative ? 1 : 0}`
            : "default";
        const aggregationMode =
            seriesOptions.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE;
        const requestedAllianceIds = normalizeRequestedAllianceIdsForKey(
            seriesOptions.requestedAllianceIds,
        );
        const allianceKey = requestedAllianceIds.length > 0
            ? requestedAllianceIds.join(".")
            : "all";
        const cityKey = buildCityRangeCacheKey(
            seriesOptions.cityRange ?? DEFAULT_CITY_RANGE,
        );

        return `${metricKey}|agg:${aggregationMode}|ids:${allianceKey}|city:${cityKey}`;
    }

    function computeSeriesLocally(
        graphData: GraphData,
        computeOptions: {
            metric: TierMetric;
            aggregationMode?: BubbleAggregationMode;
            selectedAllianceIds?: number[];
            cityRange?: CityRange;
        },
        reason: string,
    ): MetricTimeSeriesResult | null {
        incrementPerfCounter("graph.metric-time.compute.local", 1, {
            reason,
        });
        return buildMetricTimeSeries({
            data: graphData,
            metric: computeOptions.metric,
            aggregationMode: computeOptions.aggregationMode,
            selectedAllianceIds: computeOptions.selectedAllianceIds,
            cityRange: computeOptions.cityRange,
        });
    }

    async function computeSeries(options: {
        metric: TierMetric;
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange?: CityRange;
        graphData?: GraphData;
    }): Promise<MetricTimeSeriesResult | null> {
        return runWhileAlive(async () => {
            const graphData = await resolveGraphData(options.graphData);
            if (!hasWorker) {
                return computeSeriesLocally(graphData, options, "worker-unavailable");
            }

            if (options.graphData && !datasetReady) {
                return computeSeriesLocally(graphData, options, "worker-not-ready");
            }

            try {
                await ensureDatasetReady(graphData);
                const roundTripStart = nowMs();
                const workerResult = await request<
                    WorkerDatasetComputeResult<MetricTimeSeriesResult | null>,
                    WorkerDatasetComputeRequest<MetricTimeSeriesParams>
                >(
                    {
                        action: "compute",
                        datasetKey,
                        params: {
                            metric: options.metric,
                            aggregationMode: options.aggregationMode,
                            selectedAllianceIds: options.selectedAllianceIds,
                            cityRange: options.cityRange,
                        },
                    },
                    "metric time series compute",
                );
                recordWorkerTiming(workerResult.timings, roundTripStart);
                return workerResult.value;
            } catch (error) {
                console.warn(
                    "Metric time worker compute failed, falling back to main thread",
                    error,
                );
                return computeSeriesLocally(graphData, options, "worker-error");
            }
        });
    }

    async function getSeries(seriesOptions: {
        cacheKey: string;
        metric: TierMetric;
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange?: CityRange;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }): Promise<MetricTimeSeriesResult | null> {
        return warmMetricTimeSeries({
            cacheKey: seriesOptions.cacheKey,
            contextKey: seriesOptions.contextKey,
            requestId: seriesOptions.requestId,
            compute: () =>
                computeSeries({
                    metric: seriesOptions.metric,
                    aggregationMode: seriesOptions.aggregationMode,
                    selectedAllianceIds: seriesOptions.selectedAllianceIds,
                    cityRange: seriesOptions.cityRange,
                    graphData: seriesOptions.graphData,
                }),
        });
    }

    async function bootstrapVisibleSeries(seriesOptions: {
        metric?: TierMetric | null;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange?: CityRange;
        contextKey?: string;
        requestId?: number;
    }): Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        series: MetricTimeSeriesResult | null;
        graphData?: GraphData;
    } | null> {
        const requestKey = buildMetricTimeBootstrapRequestKey(seriesOptions);
        const existing = pendingVisibleSeriesByKey.get(requestKey);
        if (existing) {
            return existing;
        }

        const created = runWhileAlive(async () => {
            if (datasetReady && routeInfo) {
                const metric = resolveRequestedMetricTimeMetric(
                    routeInfo,
                    seriesOptions.metric,
                );
                const selectedAllianceIds = Array.from(
                    resolveMetricTimeAllowedAllianceIds(
                        routeInfo,
                        seriesOptions.requestedAllianceIds,
                    ),
                );
                const cacheKey = buildMetricTimeCacheKey({
                    info: routeInfo,
                    metric,
                    selectedAllianceIds,
                    aggregationMode: seriesOptions.aggregationMode,
                    cityRange: seriesOptions.cityRange,
                });
                return {
                    info: routeInfo,
                    selectedAllianceIds,
                    cacheKey,
                    series: await getSeries({
                        cacheKey,
                        metric,
                        aggregationMode: seriesOptions.aggregationMode,
                        selectedAllianceIds,
                        cityRange: seriesOptions.cityRange,
                        contextKey: seriesOptions.contextKey,
                        requestId: seriesOptions.requestId,
                    }),
                };
            }

            if (!hasWorker) {
                const graphData = await loadConflictGraphPayload({
                    conflictId: options.conflictId,
                    version: options.version,
                    decompressStrategy: "worker-bytes",
                });
                const info = buildGraphRouteInfo(graphData);
                routeInfo = info;
                const metric = resolveRequestedMetricTimeMetric(
                    info,
                    seriesOptions.metric,
                );
                const selectedAllianceIds = Array.from(
                    resolveMetricTimeAllowedAllianceIds(
                        info,
                        seriesOptions.requestedAllianceIds,
                    ),
                );
                const cacheKey = buildMetricTimeCacheKey({
                    info,
                    metric,
                    selectedAllianceIds,
                    aggregationMode: seriesOptions.aggregationMode,
                    cityRange: seriesOptions.cityRange,
                });
                return {
                    info,
                    selectedAllianceIds,
                    cacheKey,
                    series: await getSeries({
                        cacheKey,
                        metric,
                        aggregationMode: seriesOptions.aggregationMode,
                        selectedAllianceIds,
                        cityRange: seriesOptions.cityRange,
                        graphData,
                        contextKey: seriesOptions.contextKey,
                        requestId: seriesOptions.requestId,
                    }),
                    graphData,
                };
            }

            try {
                const url = getConflictGraphDataUrl(options.conflictId, options.version);
                const fetchStart = nowMs();
                const compressedBytes = await loadCompressedPayloadBuffer(url, {
                    spanName: "decompress.worker.bytes.fetch",
                });
                const fetchDurationMs = Math.max(0, nowMs() - fetchStart);
                const workerResult = await request<
                    MetricTimeVisibleBootstrapResult,
                    MetricTimeVisibleBootstrapRequest
                >(
                    {
                        action: "bootstrapVisible",
                        datasetKey,
                        compressedBytes,
                        params: {
                            metric: seriesOptions.metric,
                            aggregationMode: seriesOptions.aggregationMode,
                            requestedAllianceIds: seriesOptions.requestedAllianceIds,
                            cityRange: seriesOptions.cityRange,
                        },
                    },
                    "metric time visible bootstrap",
                    30_000,
                    [compressedBytes],
                );
                datasetReady = true;
                routeInfo = workerResult.info;
                recordVisibleBootstrapTiming(workerResult.timings);
                recordPerfSpan(
                    "decompress.worker.bytes.inflate",
                    workerResult.timings.inflateMs,
                    { url },
                );
                recordPerfSpan(
                    "decompress.worker.bytes.unpack",
                    workerResult.timings.unpackMs,
                    { url },
                );
                recordPerfSpan(
                    "decompress.worker.bytes.total",
                    fetchDurationMs +
                        workerResult.timings.inflateMs +
                        workerResult.timings.unpackMs,
                    { url },
                );
                recordPerfSpan(
                    "journey.conflict_to_metric_time.graphCompute",
                    workerResult.timings.computeMs,
                    { workerAvailable: true },
                );
                incrementPerfCounter("decompress.worker.bytes.success");

                const cacheKey = buildMetricTimeCacheKey({
                    info: workerResult.info,
                    metric: workerResult.metric,
                    selectedAllianceIds: workerResult.selectedAllianceIds,
                    aggregationMode: seriesOptions.aggregationMode,
                    cityRange: seriesOptions.cityRange,
                });
                if (workerResult.value) {
                    recordMetricTimeSeries(cacheKey, workerResult.value);
                }
                return {
                    info: workerResult.info,
                    selectedAllianceIds: workerResult.selectedAllianceIds,
                    cacheKey,
                    series: workerResult.value,
                };
            } catch (error) {
                console.warn(
                    "Metric time visible bootstrap failed, falling back to main-thread decode",
                    error,
                );
                const graphData = await loadConflictGraphPayload({
                    conflictId: options.conflictId,
                    version: options.version,
                    decompressStrategy: "worker-bytes",
                });
                const info = buildGraphRouteInfo(graphData);
                routeInfo = info;
                const metric = resolveRequestedMetricTimeMetric(
                    info,
                    seriesOptions.metric,
                );
                const selectedAllianceIds = Array.from(
                    resolveMetricTimeAllowedAllianceIds(
                        info,
                        seriesOptions.requestedAllianceIds,
                    ),
                );
                const cacheKey = buildMetricTimeCacheKey({
                    info,
                    metric,
                    selectedAllianceIds,
                    aggregationMode: seriesOptions.aggregationMode,
                    cityRange: seriesOptions.cityRange,
                });
                return {
                    info,
                    selectedAllianceIds,
                    cacheKey,
                    series: await getSeries({
                        cacheKey,
                        metric,
                        aggregationMode: seriesOptions.aggregationMode,
                        selectedAllianceIds,
                        cityRange: seriesOptions.cityRange,
                        graphData,
                        contextKey: seriesOptions.contextKey,
                        requestId: seriesOptions.requestId,
                    }),
                    graphData,
                };
            }
        }).finally(() => {
            pendingVisibleSeriesByKey.delete(requestKey);
        });

        pendingVisibleSeriesByKey.set(requestKey, created);
        return created;
    }

    async function warmDefaultSeries(warmOptions?: {
        graphData?: GraphData;
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        contextKey?: string;
        requestId?: number;
    }): Promise<MetricTimeSeriesResult | null> {
        const warmed = await bootstrapVisibleSeries({
            metric: warmOptions?.graphData
                ? buildDefaultMetricTimeMetric(buildGraphRouteInfo(warmOptions.graphData))
                : null,
            aggregationMode: warmOptions?.aggregationMode,
            requestedAllianceIds: warmOptions?.requestedAllianceIds,
            contextKey: warmOptions?.contextKey,
            requestId: warmOptions?.requestId,
        });
        return warmed?.series ?? null;
    }

    return {
        datasetKey,
        conflictId: options.conflictId,
        version: options.version,
        hasWorker,
        acquire,
        release,
        scheduleReleaseIfIdle,
        bootstrapVisibleSeries,
        getSeries,
        warmDefaultSeries,
    };
}

function getSharedMetricTimeHandle(options: {
    conflictId: string;
    version: string | number;
}): SharedMetricTimeHandle {
    const key = `metric-time:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, options.version)}`;
    const cached = metricTimeHandles.get(key);
    if (cached) return cached;

    const handle = createSharedMetricTimeHandle({
        ...options,
        onTerminate: () => {
            const current = metricTimeHandles.get(key);
            if (current === handle) {
                metricTimeHandles.delete(key);
            }
        },
    });
    metricTimeHandles.set(key, handle);
    return handle;
}

export function acquireMetricTimeArtifactHandle(options: {
    conflictId: string;
    version?: string | number;
}): MetricTimeArtifactHandle {
    const version = options.version ?? config.version.graph_data;
    const shared = getSharedMetricTimeHandle({
        conflictId: options.conflictId,
        version,
    });
    shared.acquire();
    let released = false;

    function ensureOwned(): void {
        if (released) {
            throw new Error("Metric time artifact handle has been released.");
        }
    }

    return {
        conflictId: options.conflictId,
        version,
        datasetKey: shared.datasetKey,
        hasWorker() {
            ensureOwned();
            return shared.hasWorker;
        },
        bootstrapVisibleSeries(seriesOptions) {
            ensureOwned();
            return shared.bootstrapVisibleSeries(seriesOptions);
        },
        loadGraphData() {
            ensureOwned();
            return loadConflictGraphPayload({
                conflictId: options.conflictId,
                version,
                decompressStrategy: "worker-bytes",
            });
        },
        getSeries(seriesOptions) {
            ensureOwned();
            return shared.getSeries(seriesOptions);
        },
        warmDefaultSeries(seriesOptions) {
            ensureOwned();
            return shared.warmDefaultSeries(seriesOptions);
        },
        destroy() {
            if (released) return;
            released = true;
            shared.release();
        },
    };
}
