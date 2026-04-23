import {
    decompressBson,
    hasDecompressedPayload,
    loadCompressedPayloadBuffer,
} from "./binary";
import { appConfig as config } from "./appConfig";
import {
    buildConflictArtifactRegistryKey,
    buildConflictGraphPayloadArtifactKey,
    buildConflictPayloadArtifactKey,
} from "./conflictArtifactKeys";
import {
    hasConflictGraphPayloadArtifact,
    loadConflictGraphPayload,
} from "./conflictGraphPayload";
import {
    buildGraphRouteInfo,
    resolveInitialAllowedAllianceIds,
    type GraphRouteInfo,
} from "./graphRouteInfo";
import {
    DEFAULT_BUBBLE_METRICS,
    DEFAULT_TIERING_METRICS,
    buildBubbleDatasetKey,
    buildBubbleTraceCacheKey,
    buildDefaultTieringAllianceIds,
    buildTieringDatasetCacheKey,
    buildTieringDatasetKey,
} from "./graphArtifactKeys";
import {
    hasBubbleTrace,
    recordTieringDataset,
    hasTieringDataset,
    warmBubbleDefaultTrace,
    warmTieringDefaultDataset,
    type TieringDataSetResponse,
    type TraceBuildResult,
} from "./graphDerivedCache";
import { getDataSetsByTime } from "./tieringDatasetCompute";
import { generateTraces } from "./bubbleTraceCompute";
import { incrementPerfCounter, recordPerfSpan } from "./perf";
import {
    getConflictDataUrl,
    getConflictGraphDataUrl,
} from "./runtime";
import type { Conflict, GraphData, TierMetric } from "./types";
import { requestWorkerRpc } from "./workerRpc";
import type {
    BubbleVisibleBootstrapRequest,
    BubbleVisibleBootstrapResult,
} from "../workers/bubbleTraceWorker";
import type {
    TieringVisibleBootstrapRequest,
    TieringVisibleBootstrapResult,
} from "../workers/tieringDataWorker";
import type {
    WorkerDatasetComputeRequest,
    WorkerDatasetComputeResult,
    WorkerDatasetInitRequest,
    WorkerDatasetInitResult,
    WorkerTimingBreakdown,
    WorkerVisibleBootstrapTimingBreakdown,
} from "./workerDatasetProtocol";
import {
    hasConflictGridWorkerArtifact,
    warmConflictGridWorkerDataset,
} from "./conflictGrid/workerClient";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "./bubbleAggregation";
import { DEFAULT_CITY_RANGE, type CityRange } from "./cityRange";
import {
    ConflictGridLayout,
    type ConflictGridLayoutValue,
} from "./conflictGrid/rowIds";

const GRAPH_PAYLOAD_ESTIMATED_BYTES = 1_200_000;
const CONFLICT_PAYLOAD_ESTIMATED_BYTES = 900_000;
const SHARED_GRAPH_WORKER_TTL_MS = 60_000;

export {
    buildConflictArtifactRegistryKey,
    buildConflictGraphPayloadArtifactKey,
    buildConflictPayloadArtifactKey,
} from "./conflictArtifactKeys";
export { acquireMetricTimeArtifactHandle } from "./metricTimeArtifactRegistry";
export type { MetricTimeArtifactHandle } from "./metricTimeArtifactRegistry";

function createBubbleTraceWorker(): Worker | null {
    try {
        return new Worker(new URL("../workers/bubbleTraceWorker.ts", import.meta.url), {
            type: "module",
        });
    } catch (error) {
        console.warn("Bubble worker unavailable, using main-thread fallback", error);
        return null;
    }
}

function createTieringDataWorker(): Worker | null {
    try {
        return new Worker(new URL("../workers/tieringDataWorker.ts", import.meta.url), {
            type: "module",
        });
    } catch (error) {
        console.warn("Tiering worker unavailable, using main-thread fallback", error);
        return null;
    }
}

type ArtifactRelation = "requires" | "requires-any";

type BubbleTraceParams = {
    metrics: [TierMetric, TierMetric, TierMetric];
    aggregationMode?: BubbleAggregationMode;
    requestedAllianceIds?: number[] | null;
    selectedAllianceIds?: number[];
    cityRange: CityRange;
};

type SharedGraphWorkerCore = {
    readonly datasetKey: string;
    readonly conflictId: string;
    readonly version: string | number;
    readonly hasWorker: boolean;
    isDatasetReady: () => boolean;
    markDatasetReady: () => void;
    acquire: () => void;
    release: () => void;
    scheduleReleaseIfIdle: () => void;
    getRouteInfo: () => GraphRouteInfo | null;
    setRouteInfo: (info: GraphRouteInfo) => void;
    runWhileAlive: <T>(operation: () => Promise<T>) => Promise<T>;
    resolveGraphData: (graphData?: GraphData) => Promise<GraphData>;
    ensureRouteInfo: (graphData?: GraphData) => Promise<{
        info: GraphRouteInfo;
        graphData?: GraphData;
    }>;
    ensureDatasetReady: (graphData?: GraphData) => Promise<void>;
    request: <Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs?: number,
        transfer?: Transferable[],
    ) => Promise<Result>;
};

type SharedBubbleHandle = {
    readonly datasetKey: string;
    readonly conflictId: string;
    readonly version: string | number;
    readonly hasWorker: boolean;
    acquire: () => void;
    release: () => void;
    scheduleReleaseIfIdle: () => void;
    bootstrapVisibleTrace: (options: {
        cacheKey: string;
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange: CityRange;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        trace: TraceBuildResult | null;
        graphData?: GraphData;
    } | null>;
    getTrace: (options: {
        cacheKey: string;
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange: CityRange;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }) => Promise<TraceBuildResult | null>;
    warmDefaultTrace: (options?: {
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }) => Promise<TraceBuildResult | null>;
};

type SharedTieringHandle = {
    readonly datasetKey: string;
    readonly conflictId: string;
    readonly version: string | number;
    readonly hasWorker: boolean;
    acquire: () => void;
    release: () => void;
    scheduleReleaseIfIdle: () => void;
    bootstrapVisibleDataset: (options: {
        metrics: TierMetric[];
        requestedAllianceIds?: number[] | null;
        useSingleColor: boolean;
        cityBandSize: number;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        dataset: TieringDataSetResponse | null;
        graphData?: GraphData;
    } | null>;
    getDataset: (options: {
        cacheKey: string;
        metrics: TierMetric[];
        allianceIds: number[][];
        useSingleColor: boolean;
        cityBandSize: number;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }) => Promise<TieringDataSetResponse | null>;
    warmDefaultDataset: (options?: {
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }) => Promise<TieringDataSetResponse | null>;
};

export type ConflictArtifactDependencyEdge = {
    relation: ArtifactRelation;
    artifactKeys: string[];
};

export type ConflictArtifactDescriptor = {
    key: string;
    dependencyEdges: ConflictArtifactDependencyEdge[];
    estimatedBytes: number;
    isFresh: () => boolean;
    warm: () => Promise<void>;
};

export type BubbleArtifactHandle = {
    readonly conflictId: string;
    readonly version: string | number;
    readonly datasetKey: string;
    hasWorker: () => boolean;
    bootstrapVisibleTrace: (options: {
        cacheKey: string;
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange: CityRange;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        trace: TraceBuildResult | null;
        graphData?: GraphData;
    } | null>;
    loadGraphData: () => Promise<GraphData>;
    getTrace: SharedBubbleHandle["getTrace"];
    warmDefaultTrace: SharedBubbleHandle["warmDefaultTrace"];
    destroy: () => void;
};

export type TieringArtifactHandle = {
    readonly conflictId: string;
    readonly version: string | number;
    readonly datasetKey: string;
    hasWorker: () => boolean;
    bootstrapVisibleDataset: (options: {
        metrics: TierMetric[];
        requestedAllianceIds?: number[] | null;
        useSingleColor: boolean;
        cityBandSize: number;
        contextKey?: string;
        requestId?: number;
    }) => Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        dataset: TieringDataSetResponse | null;
        graphData?: GraphData;
    } | null>;
    loadGraphData: () => Promise<GraphData>;
    getDataset: SharedTieringHandle["getDataset"];
    warmDefaultDataset: SharedTieringHandle["warmDefaultDataset"];
    destroy: () => void;
};

const bubbleHandles = new Map<string, SharedBubbleHandle>();
const tieringHandles = new Map<string, SharedTieringHandle>();

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function hasConflictPayloadArtifact(options: {
    conflictId: string;
    version?: string | number;
}): boolean {
    return hasDecompressedPayload(
        getConflictDataUrl(options.conflictId, options.version ?? config.version.conflict_data),
    );
}

export async function loadConflictPayload(options: {
    conflictId: string;
    version?: string | number;
}): Promise<Conflict> {
    return decompressBson(
        getConflictDataUrl(options.conflictId, options.version ?? config.version.conflict_data),
    ) as Promise<Conflict>;
}

function normalizeConflictLayouts(
    layouts?: ConflictGridLayoutValue[],
): ConflictGridLayoutValue[] {
    const next = (layouts && layouts.length > 0
        ? layouts
        : [ConflictGridLayout.COALITION]
    ).filter((layout, index, values) => values.indexOf(layout) === index);

    return next;
}

function createSharedGraphWorkerCore(options: {
    conflictId: string;
    version: string | number;
    datasetKey: string;
    createWorker: () => Worker | null;
    onTerminate: () => void;
}): SharedGraphWorkerCore {
    const worker = options.createWorker();
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

    async function resolveGraphData(graphData?: GraphData): Promise<GraphData> {
        if (graphData) return graphData;
        return loadConflictGraphPayload({
            conflictId: options.conflictId,
            version: options.version,
        });
    }

    async function ensureRouteInfo(graphData?: GraphData): Promise<{
        info: GraphRouteInfo;
        graphData?: GraphData;
    }> {
        if (routeInfo) {
            return {
                info: routeInfo,
                graphData,
            };
        }

        const resolvedGraphData = await resolveGraphData(graphData);
        routeInfo = buildGraphRouteInfo(resolvedGraphData);
        return {
            info: routeInfo,
            graphData: resolvedGraphData,
        };
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
                        datasetKey: options.datasetKey,
                        data,
                    },
                    {
                        timeoutMs: 30_000,
                        operation: `${options.datasetKey} dataset init`,
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

    return {
        datasetKey: options.datasetKey,
        conflictId: options.conflictId,
        version: options.version,
        hasWorker: worker != null,
        isDatasetReady() {
            return datasetReady;
        },
        markDatasetReady() {
            datasetReady = true;
        },
        acquire() {
            ensureActive();
            refCount += 1;
            clearReleaseTimer();
        },
        release() {
            if (released) return;
            refCount = Math.max(0, refCount - 1);
            scheduleReleaseIfIdle();
        },
        scheduleReleaseIfIdle,
        getRouteInfo() {
            return routeInfo;
        },
        setRouteInfo(info) {
            routeInfo = info;
        },
        runWhileAlive<T>(operation: () => Promise<T>): Promise<T> {
            ensureActive();
            clearReleaseTimer();
            return operation().finally(() => {
                scheduleReleaseIfIdle();
            });
        },
        resolveGraphData,
        ensureRouteInfo,
        ensureDatasetReady,
        request,
    };
}

function recordVisibleBootstrapTiming(
    family: "bubble" | "tiering" | "metric-time",
    timings: WorkerVisibleBootstrapTimingBreakdown,
): void {
    incrementPerfCounter(`worker.${family}.bootstrap.receive.ms`, timings.receiveMs);
    incrementPerfCounter(`worker.${family}.bootstrap.inflate.ms`, timings.inflateMs);
    incrementPerfCounter(`worker.${family}.bootstrap.unpack.ms`, timings.unpackMs);
    incrementPerfCounter(`worker.${family}.bootstrap.compute.ms`, timings.computeMs);
    incrementPerfCounter(`worker.${family}.bootstrap.respond.ms`, timings.respondMs);
    incrementPerfCounter(`worker.${family}.bootstrap.total.ms`, timings.totalMs);
}

function recordWorkerTiming(
    family: "bubble" | "tiering" | "metric-time",
    timings: WorkerTimingBreakdown,
    roundTripStart: number,
): void {
    const roundTripEnd = nowMs();
    const roundTripMs = Math.max(0, roundTripEnd - roundTripStart);
    const cloneMs = Math.max(0, roundTripMs - timings.totalMs);
    incrementPerfCounter(`worker.${family}.receive.ms`, timings.receiveMs);
    incrementPerfCounter(`worker.${family}.compute.ms`, timings.computeMs);
    incrementPerfCounter(`worker.${family}.respond.ms`, timings.respondMs);
    incrementPerfCounter(`worker.${family}.total.ms`, timings.totalMs);
    incrementPerfCounter(`worker.${family}.clone.ms`, cloneMs);
}

function createSharedBubbleHandle(options: {
    conflictId: string;
    version: string | number;
    onTerminate: () => void;
}): SharedBubbleHandle {
    const datasetKey = buildBubbleDatasetKey(options.conflictId, options.version);
    const core = createSharedGraphWorkerCore({
        conflictId: options.conflictId,
        version: options.version,
        datasetKey,
        createWorker: createBubbleTraceWorker,
        onTerminate: options.onTerminate,
    });

    function computeTraceLocally(
        graphData: GraphData,
        computeOptions: {
            metrics: [TierMetric, TierMetric, TierMetric];
            aggregationMode?: BubbleAggregationMode;
            selectedAllianceIds?: number[];
            cityRange: CityRange;
        },
        reason: string,
    ): TraceBuildResult | null {
        incrementPerfCounter("graph.bubble.compute.local", 1, {
            reason,
        });
        return generateTraces(
            graphData,
            computeOptions.metrics[0],
            computeOptions.metrics[1],
            computeOptions.metrics[2],
            computeOptions.cityRange,
            computeOptions.selectedAllianceIds,
            computeOptions.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE,
        );
    }

    async function computeTrace(options: {
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange: CityRange;
        graphData?: GraphData;
    }): Promise<TraceBuildResult | null> {
        return core.runWhileAlive(async () => {
            const graphData = await core.resolveGraphData(options.graphData);
            if (!core.hasWorker) {
                return computeTraceLocally(graphData, options, "worker-unavailable");
            }

            // Visible routes already hold the raw graph payload; cloning that full payload
            // into a cold worker before the first render costs more than computing locally.
            if (options.graphData && !core.isDatasetReady()) {
                return computeTraceLocally(graphData, options, "worker-not-ready");
            }

            try {
                await core.ensureDatasetReady(graphData);
                const roundTripStart = nowMs();
                const workerResult = await core.request<
                    WorkerDatasetComputeResult<TraceBuildResult | null>,
                    WorkerDatasetComputeRequest<BubbleTraceParams>
                >(
                    {
                        action: "compute",
                        datasetKey,
                        params: {
                            metrics: options.metrics,
                            aggregationMode:
                                options.aggregationMode ??
                                DEFAULT_BUBBLE_AGGREGATION_MODE,
                            selectedAllianceIds: options.selectedAllianceIds,
                            cityRange: options.cityRange,
                        },
                    },
                    "bubble trace compute",
                );
                recordWorkerTiming("bubble", workerResult.timings, roundTripStart);
                return workerResult.value;
            } catch (error) {
                console.warn(
                    "Bubble worker compute failed, falling back to main thread",
                    error,
                );
                return computeTraceLocally(graphData, options, "worker-error");
            }
        });
    }

    async function getTrace(traceOptions: {
        cacheKey: string;
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        selectedAllianceIds?: number[];
        cityRange: CityRange;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }): Promise<TraceBuildResult | null> {
        return warmBubbleDefaultTrace({
            cacheKey: traceOptions.cacheKey,
            contextKey: traceOptions.contextKey,
            requestId: traceOptions.requestId,
            compute: () =>
                computeTrace({
                    metrics: traceOptions.metrics,
                    aggregationMode: traceOptions.aggregationMode,
                    selectedAllianceIds: traceOptions.selectedAllianceIds,
                    cityRange: traceOptions.cityRange,
                    graphData: traceOptions.graphData,
                }),
        });
    }

    async function bootstrapTraceThroughWorker(traceOptions: {
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange: CityRange;
        recordJourneyPerf?: boolean;
    }): Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        trace: TraceBuildResult | null;
    }> {
        const url = getConflictGraphDataUrl(options.conflictId, options.version);
        const fetchStart = nowMs();
        const compressedBytes = await loadCompressedPayloadBuffer(url, {
            spanName: "decompress.worker.bytes.fetch",
        });
        const fetchDurationMs = Math.max(0, nowMs() - fetchStart);
        const workerResult = await core.request<
            BubbleVisibleBootstrapResult,
            BubbleVisibleBootstrapRequest
        >(
            {
                action: "bootstrapVisible",
                datasetKey,
                compressedBytes,
                params: {
                    metrics: traceOptions.metrics,
                    aggregationMode:
                        traceOptions.aggregationMode ??
                        DEFAULT_BUBBLE_AGGREGATION_MODE,
                    requestedAllianceIds: traceOptions.requestedAllianceIds,
                    cityRange: traceOptions.cityRange,
                },
            },
            "bubble visible bootstrap",
            30_000,
            [compressedBytes],
        );
        core.markDatasetReady();
        core.setRouteInfo(workerResult.info);
        recordVisibleBootstrapTiming("bubble", workerResult.timings);
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
        if (traceOptions.recordJourneyPerf ?? false) {
            recordPerfSpan(
                "journey.conflict_to_bubble.graphCompute",
                workerResult.timings.computeMs,
                { workerAvailable: true },
            );
        }
        incrementPerfCounter("decompress.worker.bytes.success");

        return {
            info: workerResult.info,
            selectedAllianceIds: workerResult.selectedAllianceIds,
            trace: workerResult.value,
        };
    }

    async function bootstrapVisibleTrace(traceOptions: {
        cacheKey: string;
        metrics: [TierMetric, TierMetric, TierMetric];
        aggregationMode?: BubbleAggregationMode;
        requestedAllianceIds?: number[] | null;
        cityRange: CityRange;
        contextKey?: string;
        requestId?: number;
    }): Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        trace: TraceBuildResult | null;
        graphData?: GraphData;
    } | null> {
        return core.runWhileAlive(async () => {
            let fallbackGraphData: GraphData | undefined;
            let selectedAllianceIds: number[] | null = null;
            const trace = await warmBubbleDefaultTrace({
                cacheKey: traceOptions.cacheKey,
                contextKey: traceOptions.contextKey,
                requestId: traceOptions.requestId,
                compute: async () => {
                    const existingInfo = core.getRouteInfo();
                    if (core.isDatasetReady() && existingInfo) {
                        selectedAllianceIds = Array.from(
                            resolveInitialAllowedAllianceIds(
                                existingInfo,
                                traceOptions.requestedAllianceIds,
                            ),
                        );
                        return computeTrace({
                            metrics: traceOptions.metrics,
                            aggregationMode: traceOptions.aggregationMode,
                            selectedAllianceIds,
                            cityRange: traceOptions.cityRange,
                        });
                    }

                    if (!core.hasWorker) {
                        fallbackGraphData = await loadConflictGraphPayload({
                            conflictId: options.conflictId,
                            version: options.version,
                            decompressStrategy: "worker-bytes",
                        });
                        const info = buildGraphRouteInfo(fallbackGraphData);
                        core.setRouteInfo(info);
                        selectedAllianceIds = Array.from(
                            resolveInitialAllowedAllianceIds(
                                info,
                                traceOptions.requestedAllianceIds,
                            ),
                        );
                        return computeTrace({
                            metrics: traceOptions.metrics,
                            aggregationMode: traceOptions.aggregationMode,
                            selectedAllianceIds,
                            cityRange: traceOptions.cityRange,
                            graphData: fallbackGraphData,
                        });
                    }

                    try {
                        const workerBootstrap = await bootstrapTraceThroughWorker({
                            metrics: traceOptions.metrics,
                            aggregationMode: traceOptions.aggregationMode,
                            requestedAllianceIds: traceOptions.requestedAllianceIds,
                            cityRange: traceOptions.cityRange,
                            recordJourneyPerf: true,
                        });
                        selectedAllianceIds = workerBootstrap.selectedAllianceIds;
                        return workerBootstrap.trace;
                    } catch (error) {
                        console.warn(
                            "Bubble visible bootstrap failed, falling back to main-thread decode",
                            error,
                        );
                        fallbackGraphData = await loadConflictGraphPayload({
                            conflictId: options.conflictId,
                            version: options.version,
                            decompressStrategy: "worker-bytes",
                        });
                        const info = buildGraphRouteInfo(fallbackGraphData);
                        core.setRouteInfo(info);
                        selectedAllianceIds = Array.from(
                            resolveInitialAllowedAllianceIds(
                                info,
                                traceOptions.requestedAllianceIds,
                            ),
                        );
                        return computeTrace({
                            metrics: traceOptions.metrics,
                            aggregationMode: traceOptions.aggregationMode,
                            selectedAllianceIds,
                            cityRange: traceOptions.cityRange,
                            graphData: fallbackGraphData,
                        });
                    }
                },
            });

            const routeState = await core.ensureRouteInfo(fallbackGraphData);
            fallbackGraphData ??= routeState.graphData;

            return {
                info: routeState.info,
                selectedAllianceIds:
                    selectedAllianceIds ??
                    Array.from(
                        resolveInitialAllowedAllianceIds(
                            routeState.info,
                            traceOptions.requestedAllianceIds,
                        ),
                    ),
                trace,
                graphData: fallbackGraphData,
            };
        });
    }

    async function warmDefaultTrace(warmOptions?: {
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }): Promise<TraceBuildResult | null> {
        const cacheKey = buildBubbleTraceCacheKey({
            conflictId: options.conflictId,
            graphVersion: options.version,
            metrics: DEFAULT_BUBBLE_METRICS,
            aggregationMode: DEFAULT_BUBBLE_AGGREGATION_MODE,
            allianceKey: "all",
            cityRange: DEFAULT_CITY_RANGE,
        });

        if (!warmOptions?.graphData && core.hasWorker && !core.isDatasetReady()) {
            return warmBubbleDefaultTrace({
                cacheKey,
                contextKey: warmOptions?.contextKey,
                requestId: warmOptions?.requestId,
                compute: async () => {
                    const workerBootstrap = await bootstrapTraceThroughWorker({
                        metrics: DEFAULT_BUBBLE_METRICS,
                        aggregationMode: DEFAULT_BUBBLE_AGGREGATION_MODE,
                        cityRange: DEFAULT_CITY_RANGE,
                    });
                    return workerBootstrap.trace;
                },
            });
        }

        return getTrace({
            cacheKey,
            metrics: DEFAULT_BUBBLE_METRICS,
            aggregationMode: DEFAULT_BUBBLE_AGGREGATION_MODE,
            cityRange: DEFAULT_CITY_RANGE,
            graphData: warmOptions?.graphData,
            contextKey: warmOptions?.contextKey,
            requestId: warmOptions?.requestId,
        });
    }

    return {
        datasetKey,
        conflictId: options.conflictId,
        version: options.version,
        hasWorker: core.hasWorker,
        acquire: core.acquire,
        release: core.release,
        scheduleReleaseIfIdle: core.scheduleReleaseIfIdle,
        bootstrapVisibleTrace,
        getTrace,
        warmDefaultTrace,
    };
}

function createSharedTieringHandle(options: {
    conflictId: string;
    version: string | number;
    onTerminate: () => void;
}): SharedTieringHandle {
    const datasetKey = buildTieringDatasetKey(options.conflictId, options.version);
    const core = createSharedGraphWorkerCore({
        conflictId: options.conflictId,
        version: options.version,
        datasetKey,
        createWorker: createTieringDataWorker,
        onTerminate: options.onTerminate,
    });

    function computeDatasetLocally(
        graphData: GraphData,
        computeOptions: {
            metrics: TierMetric[];
            allianceIds: number[][];
            useSingleColor: boolean;
            cityBandSize: number;
        },
        reason: string,
    ): TieringDataSetResponse | null {
        incrementPerfCounter("graph.tiering.compute.local", 1, {
            reason,
        });
        return getDataSetsByTime(
            graphData,
            computeOptions.metrics,
            computeOptions.allianceIds,
            computeOptions.useSingleColor,
            computeOptions.cityBandSize,
        );
    }

    async function computeDataset(options: {
        metrics: TierMetric[];
        allianceIds: number[][];
        useSingleColor: boolean;
        cityBandSize: number;
        graphData?: GraphData;
    }): Promise<TieringDataSetResponse | null> {
        return core.runWhileAlive(async () => {
            const graphData = await core.resolveGraphData(options.graphData);
            if (!core.hasWorker) {
                return computeDatasetLocally(graphData, options, "worker-unavailable");
            }

            // Direct route entry already has the graph payload in hand. Avoid blocking the
            // first render on cloning that payload into a cold worker dataset.
            if (options.graphData && !core.isDatasetReady()) {
                return computeDatasetLocally(graphData, options, "worker-not-ready");
            }

            try {
                await core.ensureDatasetReady(graphData);
                const roundTripStart = nowMs();
                const workerResult = await core.request<
                    WorkerDatasetComputeResult<TieringDataSetResponse | null>,
                    WorkerDatasetComputeRequest<{
                        metrics: TierMetric[];
                        alliance_ids: number[][];
                        useSingleColor: boolean;
                        cityBandSize: number;
                    }>
                >(
                    {
                        action: "compute",
                        datasetKey,
                        params: {
                            metrics: options.metrics,
                            alliance_ids: options.allianceIds,
                            useSingleColor: options.useSingleColor,
                            cityBandSize: options.cityBandSize,
                        },
                    },
                    "tiering dataset compute",
                );
                recordWorkerTiming("tiering", workerResult.timings, roundTripStart);
                return workerResult.value;
            } catch (error) {
                console.warn(
                    "Tiering worker compute failed, falling back to main thread",
                    error,
                );
                return computeDatasetLocally(graphData, options, "worker-error");
            }
        });
    }

    async function getDataset(datasetOptions: {
        cacheKey: string;
        metrics: TierMetric[];
        allianceIds: number[][];
        useSingleColor: boolean;
        cityBandSize: number;
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }): Promise<TieringDataSetResponse | null> {
        return warmTieringDefaultDataset({
            cacheKey: datasetOptions.cacheKey,
            contextKey: datasetOptions.contextKey,
            requestId: datasetOptions.requestId,
            compute: () =>
                computeDataset({
                    metrics: datasetOptions.metrics,
                    allianceIds: datasetOptions.allianceIds,
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                    graphData: datasetOptions.graphData,
                }),
        });
    }

    async function bootstrapVisibleDataset(datasetOptions: {
        metrics: TierMetric[];
        requestedAllianceIds?: number[] | null;
        useSingleColor: boolean;
        cityBandSize: number;
        contextKey?: string;
        requestId?: number;
    }): Promise<{
        info: GraphRouteInfo;
        selectedAllianceIds: number[];
        cacheKey: string;
        dataset: TieringDataSetResponse | null;
        graphData?: GraphData;
    } | null> {
        return core.runWhileAlive(async () => {
            const canAttachDefaultAllianceWarm =
                !datasetOptions.requestedAllianceIds ||
                datasetOptions.requestedAllianceIds.length === 0;
            if (canAttachDefaultAllianceWarm) {
                const cacheKey = buildTieringDatasetCacheKey({
                    conflictId: options.conflictId,
                    graphVersion: options.version,
                    metrics: datasetOptions.metrics,
                    allianceKey: "all",
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                });
                let fallbackGraphData: GraphData | undefined;
                let selectedAllianceIds: number[] | null = null;
                const dataset = await warmTieringDefaultDataset({
                    cacheKey,
                    contextKey: datasetOptions.contextKey,
                    requestId: datasetOptions.requestId,
                    compute: async () => {
                        const existingInfo = core.getRouteInfo();
                        if (core.isDatasetReady() && existingInfo) {
                            selectedAllianceIds = Array.from(
                                resolveInitialAllowedAllianceIds(existingInfo, null),
                            );
                            return computeDataset({
                                metrics: datasetOptions.metrics,
                                allianceIds: existingInfo.coalitions.map((coalition) => [
                                    ...coalition.alliance_ids,
                                ]),
                                useSingleColor: datasetOptions.useSingleColor,
                                cityBandSize: datasetOptions.cityBandSize,
                            });
                        }

                        if (!core.hasWorker) {
                            fallbackGraphData = await loadConflictGraphPayload({
                                conflictId: options.conflictId,
                                version: options.version,
                                decompressStrategy: "worker-bytes",
                            });
                            const info = buildGraphRouteInfo(fallbackGraphData);
                            core.setRouteInfo(info);
                            selectedAllianceIds = Array.from(
                                resolveInitialAllowedAllianceIds(info, null),
                            );
                            return computeDataset({
                                metrics: datasetOptions.metrics,
                                allianceIds: info.coalitions.map((coalition) => [
                                    ...coalition.alliance_ids,
                                ]),
                                useSingleColor: datasetOptions.useSingleColor,
                                cityBandSize: datasetOptions.cityBandSize,
                                graphData: fallbackGraphData,
                            });
                        }

                        try {
                            const url = getConflictGraphDataUrl(options.conflictId, options.version);
                            const fetchStart = nowMs();
                            const compressedBytes = await loadCompressedPayloadBuffer(url, {
                                spanName: "decompress.worker.bytes.fetch",
                            });
                            const fetchDurationMs = Math.max(0, nowMs() - fetchStart);
                            const workerResult = await core.request<
                                TieringVisibleBootstrapResult,
                                TieringVisibleBootstrapRequest
                            >(
                                {
                                    action: "bootstrapVisible",
                                    datasetKey,
                                    compressedBytes,
                                    params: {
                                        metrics: datasetOptions.metrics,
                                        requestedAllianceIds: null,
                                        useSingleColor: datasetOptions.useSingleColor,
                                        cityBandSize: datasetOptions.cityBandSize,
                                    },
                                },
                                "tiering visible bootstrap",
                                30_000,
                                [compressedBytes],
                            );
                            core.markDatasetReady();
                            core.setRouteInfo(workerResult.info);
                            selectedAllianceIds = workerResult.selectedAllianceIds;
                            recordVisibleBootstrapTiming("tiering", workerResult.timings);
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
                                "journey.conflict_to_tiering.graphCompute",
                                workerResult.timings.computeMs,
                                { workerAvailable: true },
                            );
                            incrementPerfCounter("decompress.worker.bytes.success");
                            return workerResult.value;
                        } catch (error) {
                            console.warn(
                                "Tiering visible bootstrap failed, falling back to main-thread decode",
                                error,
                            );
                            fallbackGraphData = await loadConflictGraphPayload({
                                conflictId: options.conflictId,
                                version: options.version,
                                decompressStrategy: "worker-bytes",
                            });
                            const info = buildGraphRouteInfo(fallbackGraphData);
                            core.setRouteInfo(info);
                            selectedAllianceIds = Array.from(
                                resolveInitialAllowedAllianceIds(info, null),
                            );
                            return computeDataset({
                                metrics: datasetOptions.metrics,
                                allianceIds: info.coalitions.map((coalition) => [
                                    ...coalition.alliance_ids,
                                ]),
                                useSingleColor: datasetOptions.useSingleColor,
                                cityBandSize: datasetOptions.cityBandSize,
                                graphData: fallbackGraphData,
                            });
                        }
                    },
                });

                const routeState = await core.ensureRouteInfo(fallbackGraphData);
                fallbackGraphData ??= routeState.graphData;
                const info = routeState.info;

                return {
                    info,
                    selectedAllianceIds:
                        selectedAllianceIds ??
                        Array.from(resolveInitialAllowedAllianceIds(info, null)),
                    cacheKey,
                    dataset,
                    graphData: fallbackGraphData,
                };
            }

            const existingInfo = core.getRouteInfo();
            if (core.isDatasetReady() && existingInfo) {
                const selectedAllianceIds = Array.from(
                    resolveInitialAllowedAllianceIds(
                        existingInfo,
                        datasetOptions.requestedAllianceIds,
                    ),
                );
                const selectedAllianceIdSet = new Set(selectedAllianceIds);
                const allianceIds = existingInfo.coalitions.map((coalition) =>
                    coalition.alliance_ids.filter((id) => selectedAllianceIdSet.has(id)),
                );
                const cacheKey = buildTieringDatasetCacheKey({
                    conflictId: options.conflictId,
                    graphVersion: options.version,
                    metrics: datasetOptions.metrics,
                    allianceIds,
                    defaultAllianceIds: buildDefaultTieringAllianceIds(existingInfo),
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                });
                return {
                    info: existingInfo,
                    selectedAllianceIds,
                    cacheKey,
                    dataset: await getDataset({
                        cacheKey,
                        metrics: datasetOptions.metrics,
                        allianceIds,
                        useSingleColor: datasetOptions.useSingleColor,
                        cityBandSize: datasetOptions.cityBandSize,
                        contextKey: datasetOptions.contextKey,
                        requestId: datasetOptions.requestId,
                    }),
                };
            }

            if (!core.hasWorker) {
                const graphData = await loadConflictGraphPayload({
                    conflictId: options.conflictId,
                    version: options.version,
                    decompressStrategy: "worker-bytes",
                });
                const info = buildGraphRouteInfo(graphData);
                core.setRouteInfo(info);
                const selectedAllianceIds = Array.from(
                    resolveInitialAllowedAllianceIds(
                        info,
                        datasetOptions.requestedAllianceIds,
                    ),
                );
                const selectedAllianceIdSet = new Set(selectedAllianceIds);
                const allianceIds = info.coalitions.map((coalition) =>
                    coalition.alliance_ids.filter((id) => selectedAllianceIdSet.has(id)),
                );
                const cacheKey = buildTieringDatasetCacheKey({
                    conflictId: options.conflictId,
                    graphVersion: options.version,
                    metrics: datasetOptions.metrics,
                    allianceIds,
                    defaultAllianceIds: buildDefaultTieringAllianceIds(info),
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                });
                return {
                    info,
                    selectedAllianceIds,
                    cacheKey,
                    dataset: await getDataset({
                        cacheKey,
                        metrics: datasetOptions.metrics,
                        allianceIds,
                        useSingleColor: datasetOptions.useSingleColor,
                        cityBandSize: datasetOptions.cityBandSize,
                        graphData,
                        contextKey: datasetOptions.contextKey,
                        requestId: datasetOptions.requestId,
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
                const workerResult = await core.request<
                    TieringVisibleBootstrapResult,
                    TieringVisibleBootstrapRequest
                >(
                    {
                        action: "bootstrapVisible",
                        datasetKey,
                        compressedBytes,
                        params: {
                            metrics: datasetOptions.metrics,
                            requestedAllianceIds: datasetOptions.requestedAllianceIds,
                            useSingleColor: datasetOptions.useSingleColor,
                            cityBandSize: datasetOptions.cityBandSize,
                        },
                    },
                    "tiering visible bootstrap",
                    30_000,
                    [compressedBytes],
                );
                core.markDatasetReady();
                core.setRouteInfo(workerResult.info);
                recordVisibleBootstrapTiming("tiering", workerResult.timings);
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
                    "journey.conflict_to_tiering.graphCompute",
                    workerResult.timings.computeMs,
                    { workerAvailable: true },
                );
                incrementPerfCounter("decompress.worker.bytes.success");

                const dataset = workerResult.value;
                const selectedAllianceIdSet = new Set(workerResult.selectedAllianceIds);
                const allianceIds = workerResult.info.coalitions.map((coalition) =>
                    coalition.alliance_ids.filter((id) => selectedAllianceIdSet.has(id)),
                );
                const cacheKey = buildTieringDatasetCacheKey({
                    conflictId: options.conflictId,
                    graphVersion: options.version,
                    metrics: datasetOptions.metrics,
                    allianceIds,
                    defaultAllianceIds: buildDefaultTieringAllianceIds(workerResult.info),
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                });
                if (dataset) {
                    recordTieringDataset(cacheKey, dataset);
                }
                return {
                    info: workerResult.info,
                    selectedAllianceIds: workerResult.selectedAllianceIds,
                    cacheKey,
                    dataset,
                };
            } catch (error) {
                console.warn(
                    "Tiering visible bootstrap failed, falling back to main-thread decode",
                    error,
                );
                const graphData = await loadConflictGraphPayload({
                    conflictId: options.conflictId,
                    version: options.version,
                    decompressStrategy: "worker-bytes",
                });
                const info = buildGraphRouteInfo(graphData);
                core.setRouteInfo(info);
                const selectedAllianceIds = Array.from(
                    resolveInitialAllowedAllianceIds(
                        info,
                        datasetOptions.requestedAllianceIds,
                    ),
                );
                const selectedAllianceIdSet = new Set(selectedAllianceIds);
                const allianceIds = info.coalitions.map((coalition) =>
                    coalition.alliance_ids.filter((id) => selectedAllianceIdSet.has(id)),
                );
                const cacheKey = buildTieringDatasetCacheKey({
                    conflictId: options.conflictId,
                    graphVersion: options.version,
                    metrics: datasetOptions.metrics,
                    allianceIds,
                    defaultAllianceIds: buildDefaultTieringAllianceIds(info),
                    useSingleColor: datasetOptions.useSingleColor,
                    cityBandSize: datasetOptions.cityBandSize,
                });
                return {
                    info,
                    selectedAllianceIds,
                    cacheKey,
                    dataset: await getDataset({
                        cacheKey,
                        metrics: datasetOptions.metrics,
                        allianceIds,
                        useSingleColor: datasetOptions.useSingleColor,
                        cityBandSize: datasetOptions.cityBandSize,
                        graphData,
                        contextKey: datasetOptions.contextKey,
                        requestId: datasetOptions.requestId,
                    }),
                    graphData,
                };
            }
        });
    }

    async function warmDefaultDataset(warmOptions?: {
        graphData?: GraphData;
        contextKey?: string;
        requestId?: number;
    }): Promise<TieringDataSetResponse | null> {
        const graphData = warmOptions?.graphData ??
            await loadConflictGraphPayload({
                conflictId: options.conflictId,
                version: options.version,
            });
        const cacheKey = buildTieringDatasetCacheKey({
            conflictId: options.conflictId,
            graphVersion: options.version,
            metrics: DEFAULT_TIERING_METRICS,
            allianceIds: buildDefaultTieringAllianceIds(graphData),
            defaultAllianceIds: buildDefaultTieringAllianceIds(graphData),
            useSingleColor: false,
            cityBandSize: 0,
        });

        return getDataset({
            cacheKey,
            metrics: DEFAULT_TIERING_METRICS,
            allianceIds: buildDefaultTieringAllianceIds(graphData),
            useSingleColor: false,
            cityBandSize: 0,
            graphData,
            contextKey: warmOptions?.contextKey,
            requestId: warmOptions?.requestId,
        });
    }

    return {
        datasetKey,
        conflictId: options.conflictId,
        version: options.version,
        hasWorker: core.hasWorker,
        acquire: core.acquire,
        release: core.release,
        scheduleReleaseIfIdle: core.scheduleReleaseIfIdle,
        bootstrapVisibleDataset,
        getDataset,
        warmDefaultDataset,
    };
}

function getSharedBubbleHandle(options: {
    conflictId: string;
    version: string | number;
}): SharedBubbleHandle {
    const key = `bubble:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, options.version)}`;
    const cached = bubbleHandles.get(key);
    if (cached) return cached;

    const handle = createSharedBubbleHandle({
        ...options,
        onTerminate: () => {
            const current = bubbleHandles.get(key);
            if (current === handle) {
                bubbleHandles.delete(key);
            }
        },
    });
    bubbleHandles.set(key, handle);
    return handle;
}

function getSharedTieringHandle(options: {
    conflictId: string;
    version: string | number;
}): SharedTieringHandle {
    const key = `tiering:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, options.version)}`;
    const cached = tieringHandles.get(key);
    if (cached) return cached;

    const handle = createSharedTieringHandle({
        ...options,
        onTerminate: () => {
            const current = tieringHandles.get(key);
            if (current === handle) {
                tieringHandles.delete(key);
            }
        },
    });
    tieringHandles.set(key, handle);
    return handle;
}

export function acquireBubbleArtifactHandle(options: {
    conflictId: string;
    version?: string | number;
}): BubbleArtifactHandle {
    const version = options.version ?? config.version.graph_data;
    const shared = getSharedBubbleHandle({
        conflictId: options.conflictId,
        version,
    });
    shared.acquire();
    let released = false;

    function ensureOwned(): void {
        if (released) {
            throw new Error("Bubble artifact handle has been released.");
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
        bootstrapVisibleTrace(traceOptions) {
            ensureOwned();
            return shared.bootstrapVisibleTrace(traceOptions);
        },
        loadGraphData() {
            ensureOwned();
            return loadConflictGraphPayload({
                conflictId: options.conflictId,
                version,
                decompressStrategy: "worker-bytes",
            });
        },
        getTrace(traceOptions) {
            ensureOwned();
            return shared.getTrace(traceOptions);
        },
        warmDefaultTrace(traceOptions) {
            ensureOwned();
            return shared.warmDefaultTrace(traceOptions);
        },
        destroy() {
            if (released) return;
            released = true;
            shared.release();
        },
    };
}

export function acquireTieringArtifactHandle(options: {
    conflictId: string;
    version?: string | number;
}): TieringArtifactHandle {
    const version = options.version ?? config.version.graph_data;
    const shared = getSharedTieringHandle({
        conflictId: options.conflictId,
        version,
    });
    shared.acquire();
    let released = false;

    function ensureOwned(): void {
        if (released) {
            throw new Error("Tiering artifact handle has been released.");
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
        bootstrapVisibleDataset(datasetOptions) {
            ensureOwned();
            return shared.bootstrapVisibleDataset(datasetOptions);
        },
        loadGraphData() {
            ensureOwned();
            return loadConflictGraphPayload({
                conflictId: options.conflictId,
                version,
                decompressStrategy: "worker-bytes",
            });
        },
        getDataset(datasetOptions) {
            ensureOwned();
            return shared.getDataset(datasetOptions);
        },
        warmDefaultDataset(datasetOptions) {
            ensureOwned();
            return shared.warmDefaultDataset(datasetOptions);
        },
        destroy() {
            if (released) return;
            released = true;
            shared.release();
        },
    };
}

export function createConflictPayloadArtifactDescriptor(options: {
    conflictId: string;
    version?: string | number;
}): ConflictArtifactDescriptor {
    const version = options.version ?? config.version.conflict_data;
    return {
        key: buildConflictPayloadArtifactKey(options.conflictId, version),
        dependencyEdges: [],
        estimatedBytes: hasConflictPayloadArtifact({
            conflictId: options.conflictId,
            version,
        })
            ? 0
            : CONFLICT_PAYLOAD_ESTIMATED_BYTES,
        isFresh: () => hasConflictPayloadArtifact({
            conflictId: options.conflictId,
            version,
        }),
        warm: async () => {
            await loadConflictPayload({
                conflictId: options.conflictId,
                version,
            });
        },
    };
}

export function createConflictGraphPayloadArtifactDescriptor(options: {
    conflictId: string;
    version?: string | number;
}): ConflictArtifactDescriptor {
    const version = options.version ?? config.version.graph_data;
    return {
        key: buildConflictGraphPayloadArtifactKey(options.conflictId, version),
        dependencyEdges: [],
        estimatedBytes: hasConflictGraphPayloadArtifact({
            conflictId: options.conflictId,
            version,
        })
            ? 0
            : GRAPH_PAYLOAD_ESTIMATED_BYTES,
        isFresh: () => hasConflictGraphPayloadArtifact({
            conflictId: options.conflictId,
            version,
        }),
        warm: async () => {
            await loadConflictGraphPayload({
                conflictId: options.conflictId,
                version,
            });
        },
    };
}

export function createBubbleDefaultArtifactDescriptor(options: {
    conflictId: string;
    version?: string | number;
    contextKey?: string;
    requestId?: number;
}): ConflictArtifactDescriptor {
    const version = options.version ?? config.version.graph_data;
    const cacheKey = buildBubbleTraceCacheKey({
        conflictId: options.conflictId,
        graphVersion: version,
        metrics: DEFAULT_BUBBLE_METRICS,
        aggregationMode: DEFAULT_BUBBLE_AGGREGATION_MODE,
        allianceKey: "all",
        cityRange: DEFAULT_CITY_RANGE,
    });

    return {
        key: `bubble:default:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, version)}`,
        dependencyEdges: [
            {
                relation: "requires",
                artifactKeys: [
                    buildConflictGraphPayloadArtifactKey(options.conflictId, version),
                ],
            },
        ],
        estimatedBytes: hasConflictGraphPayloadArtifact({
            conflictId: options.conflictId,
            version,
        })
            ? 0
            : GRAPH_PAYLOAD_ESTIMATED_BYTES,
        isFresh: () => hasBubbleTrace(cacheKey),
        warm: async () => {
            const handle = getSharedBubbleHandle({
                conflictId: options.conflictId,
                version,
            });
            try {
                await handle.warmDefaultTrace({
                    contextKey: options.contextKey,
                    requestId: options.requestId,
                });
            } finally {
                handle.scheduleReleaseIfIdle();
            }
        },
    };
}

export function createTieringDefaultArtifactDescriptor(options: {
    conflictId: string;
    version?: string | number;
    contextKey?: string;
    requestId?: number;
}): ConflictArtifactDescriptor {
    const version = options.version ?? config.version.graph_data;
    const cacheKey = buildTieringDatasetCacheKey({
        conflictId: options.conflictId,
        graphVersion: version,
        metrics: DEFAULT_TIERING_METRICS,
        allianceKey: "all",
        useSingleColor: false,
        cityBandSize: 0,
    });

    return {
        key: `tiering:default:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, version)}`,
        dependencyEdges: [
            {
                relation: "requires",
                artifactKeys: [
                    buildConflictGraphPayloadArtifactKey(options.conflictId, version),
                ],
            },
        ],
        estimatedBytes: hasConflictGraphPayloadArtifact({
            conflictId: options.conflictId,
            version,
        })
            ? 0
            : GRAPH_PAYLOAD_ESTIMATED_BYTES,
        isFresh: () => hasTieringDataset(cacheKey),
        warm: async () => {
            const handle = getSharedTieringHandle({
                conflictId: options.conflictId,
                version,
            });
            try {
                await handle.warmDefaultDataset({
                    contextKey: options.contextKey,
                    requestId: options.requestId,
                });
            } finally {
                handle.scheduleReleaseIfIdle();
            }
        },
    };
}

export function createConflictGridArtifactDescriptor(options: {
    conflictId: string;
    version?: string | number;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
}): ConflictArtifactDescriptor {
    const version = options.version ?? config.version.conflict_data;
    const layouts = normalizeConflictLayouts(options.layouts);
    const aggressive = options.aggressive ?? false;
    const layoutKey = layouts.join(".");

    return {
        key: `conflict-grid:${buildConflictArtifactRegistryKey({ kind: "conflict", id: options.conflictId }, version)}:layouts:${layoutKey}:aggressive:${aggressive ? 1 : 0}`,
        dependencyEdges: [
            {
                relation: "requires",
                artifactKeys: [
                    buildConflictPayloadArtifactKey(options.conflictId, version),
                ],
            },
        ],
        estimatedBytes: hasConflictPayloadArtifact({
            conflictId: options.conflictId,
            version,
        })
            ? 0
            : CONFLICT_PAYLOAD_ESTIMATED_BYTES,
        isFresh: () =>
            hasConflictGridWorkerArtifact({
                conflictId: options.conflictId,
                version,
                layouts,
            }),
        warm: async () => {
            await warmConflictGridWorkerDataset({
                conflictId: options.conflictId,
                version,
                layouts,
                aggressive,
            });
        },
    };
}
