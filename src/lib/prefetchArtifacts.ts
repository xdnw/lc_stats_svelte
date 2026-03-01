import { decompressBson } from "./binary";
import type { Conflict, GraphData, TierMetric } from "./types";
import { getConflictDataUrl, getConflictGraphDataUrl, getConflictsIndexUrl, prewarmRuntimeGroup, type RuntimePrefetchGroup } from "./runtime";
import { queueArtifactPrefetch, promotePrefetchTarget, type ArtifactPrefetchTaskDescriptor, type PrefetchPriority } from "./prefetchCoordinator";
import { appConfig as config } from "./appConfig";
import { getOrComputeConflictTableData, warmConflictTableLayouts, type ConflictTableLayoutInput } from "./conflictLayoutCache";
import {
    ensureBubbleDatasetReady,
    ensureTieringDatasetReady,
    warmBubbleDefaultTrace,
    warmTieringDefaultDataset,
    type TraceBuildResult,
    type TieringDataSetResponse,
} from "./graphDerivedCache";
import { requestWorkerRpc } from "./workerRpc";
import {
    createModuleWorker,
} from "./workerDatasetLifecycle";
import type {
    WorkerDatasetComputeRequest,
    WorkerDatasetComputeResult,
    WorkerDatasetInitRequest,
    WorkerDatasetInitResult,
} from "./workerDatasetProtocol";
import { resolveMetricAccessors } from "./graphMetrics";
import { formatAllianceName } from "./formatting";
import { loadConflictContext } from "./conflictContext";
import { getCompositeConflictSignature } from "./conflictIds";
import { incrementPerfCounter, startPerfSpan } from "./perf";
import type { ConflictRouteContext } from "./routeBootstrap";

const DEFAULT_CONFLICT_LAYOUTS: ConflictTableLayoutInput[] = [
    {
        layout: 0,
        sort: "off:wars",
        order: "desc",
        columns: ["name", "net:damage", "off:wars", "def:wars", "dealt:damage", "loss:damage"],
    },
    {
        layout: 1,
        sort: "off:wars",
        order: "desc",
        columns: ["name", "net:damage", "off:wars", "def:wars", "dealt:damage", "loss:damage"],
    },
    {
        layout: 2,
        sort: "off:wars",
        order: "desc",
        columns: ["name", "net:damage", "off:wars", "def:wars", "dealt:damage", "loss:damage"],
    },
];

const DEFAULT_BUBBLE_METRICS: [TierMetric, TierMetric, TierMetric] = [
    { name: "dealt:loss_value", cumulative: true, normalize: false },
    { name: "loss:loss_value", cumulative: true, normalize: false },
    { name: "off:wars", cumulative: true, normalize: false },
];

const DEFAULT_TIERING_METRICS: TierMetric[] = [
    { name: "nation", cumulative: false, normalize: false },
];

const MAX_COMPOSITE_WARM_COUNT = 8;
const COMPOSITE_WARM_TIMEOUT_MS = 12_000;

type BubbleTraceParams = {
    metrics: [TierMetric, TierMetric, TierMetric];
    minCity: number;
    maxCity: number;
};

type TieringWarmParams = {
    metrics: TierMetric[];
    alliance_ids: number[][];
    useSingleColor: boolean;
    cityBandSize: number;
};

let bubbleWarmWorker: Worker | null = null;
let tieringWarmWorker: Worker | null = null;

function getBubbleWarmWorker(): Worker | null {
    if (bubbleWarmWorker) return bubbleWarmWorker;
    bubbleWarmWorker = createModuleWorker(
        new URL("../workers/bubbleTraceWorker.ts", import.meta.url),
        "Bubble warm worker unavailable",
    );
    return bubbleWarmWorker;
}

function getTieringWarmWorker(): Worker | null {
    if (tieringWarmWorker) return tieringWarmWorker;
    tieringWarmWorker = createModuleWorker(
        new URL("../workers/tieringDataWorker.ts", import.meta.url),
        "Tiering warm worker unavailable",
    );
    return tieringWarmWorker;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timeout);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

function warmSourceKey(conflictId: string, dataVersion: string | number): string {
    return `conflict:${conflictId}:v${String(dataVersion)}`;
}

function bubbleDatasetKey(conflictId: string, graphVersion: string | number): string {
    return `bubble:${conflictId}:${String(graphVersion)}`;
}

function tieringDatasetKey(conflictId: string, graphVersion: string | number): string {
    return `tiering:${conflictId}:${String(graphVersion)}`;
}

function bubbleTraceKey(conflictId: string): string {
    return `${conflictId}|dealt:loss_value:0:1|loss:loss_value:0:1|off:wars:0:1|0-70`;
}

function tieringDatasetCacheKey(conflictId: string, allianceIds: number[][]): string {
    const allianceKey = allianceIds.map((ids) => ids.join(".")).join("|");
    return `${conflictId}|nation:0:0|${allianceKey}|0|band:0`;
}

async function loadConflictPayload(conflictId: string, version = config.version.conflict_data): Promise<Conflict> {
    return (await decompressBson(getConflictDataUrl(conflictId, version))) as Conflict;
}

async function loadGraphPayload(conflictId: string, version = config.version.graph_data): Promise<GraphData> {
    return (await decompressBson(getConflictGraphDataUrl(conflictId, version))) as GraphData;
}

async function initializeBubbleDataset(datasetKey: string, data: GraphData): Promise<void> {
    const worker = getBubbleWarmWorker();
    if (!worker) return;

    await requestWorkerRpc<
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
            operation: "bubble warm dataset init",
        },
    );
}

async function initializeTieringDataset(datasetKey: string, data: GraphData): Promise<void> {
    const worker = getTieringWarmWorker();
    if (!worker) return;

    await requestWorkerRpc<
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
            operation: "tiering warm dataset init",
        },
    );
}

async function computeBubbleDefaultTrace(
    graphData: GraphData,
    conflictId: string,
): Promise<TraceBuildResult | null> {
    const worker = getBubbleWarmWorker();
    const datasetKey = bubbleDatasetKey(conflictId, config.version.graph_data);

    if (!worker) {
        return generateBubbleTraceMainThread(
            graphData,
            DEFAULT_BUBBLE_METRICS,
            0,
            70,
        );
    }

    await ensureBubbleDatasetReady(datasetKey, () =>
        initializeBubbleDataset(datasetKey, graphData),
    );

    const workerResult = await requestWorkerRpc<
        WorkerDatasetComputeRequest<BubbleTraceParams>,
        WorkerDatasetComputeResult<TraceBuildResult | null>
    >(
        worker,
        {
            action: "compute",
            datasetKey,
            params: {
                metrics: DEFAULT_BUBBLE_METRICS,
                minCity: 0,
                maxCity: 70,
            },
        },
        {
            timeoutMs: 30_000,
            operation: "bubble warm default trace compute",
        },
    );

    return workerResult.value;
}

function generateBubbleTraceMainThread(
    data: GraphData,
    metrics: [TierMetric, TierMetric, TierMetric],
    minCity: number,
    maxCity: number,
): TraceBuildResult | null {
    const metricAccessors = resolveMetricAccessors(data, metrics);
    if (!metricAccessors) return null;

    const ranges = {
        x: [0, Number.MIN_SAFE_INTEGER],
        y: [0, Number.MIN_SAFE_INTEGER],
        z: [0, Number.MIN_SAFE_INTEGER],
    };
    const rangesKeys: Array<keyof typeof ranges> = ["x", "y", "z"];
    const lookup: { [key: number]: { [key: number]: any } } = {};

    let lookupMin = Number.POSITIVE_INFINITY;
    let lookupMax = Number.NEGATIVE_INFINITY;

    for (let coalitionIdx = 0; coalitionIdx < data.coalitions.length; coalitionIdx += 1) {
        const coalition = data.coalitions[coalitionIdx];

        let minCityIndex = coalition.cities.findIndex((city) => city >= minCity);
        let maxCityIndex = coalition.cities
            .slice()
            .reverse()
            .findIndex((city) => city <= maxCity);

        if (maxCityIndex !== -1) {
            maxCityIndex = coalition.cities.length - 1 - maxCityIndex;
        }
        if (minCityIndex === -1) minCityIndex = 0;
        if (maxCityIndex === -1) maxCityIndex = coalition.cities.length;

        const turnStart = coalition.turn.range[0];
        const dayStart = coalition.day.range[0];
        const start = metricAccessors.isAnyTurn ? turnStart : dayStart;
        const end = metricAccessors.isAnyTurn
            ? coalition.turn.range[1]
            : coalition.day.range[1];

        for (let allianceIdx = 0; allianceIdx < coalition.alliance_ids.length; allianceIdx += 1) {
            const allianceId = coalition.alliance_ids[allianceIdx];
            const allianceName = formatAllianceName(
                coalition.alliance_names[allianceIdx],
                allianceId,
            );
            const buffer = [0, 0, 0];
            let lastDay = -1;

            for (let turnOrDay = start; turnOrDay <= end; turnOrDay += 1) {
                lookupMin = Math.min(lookupMin, turnOrDay);
                lookupMax = Math.max(lookupMax, turnOrDay);

                let traceByCoalition = lookup[turnOrDay];
                if (!traceByCoalition) {
                    traceByCoalition = {};
                    lookup[turnOrDay] = traceByCoalition;
                }

                let trace = traceByCoalition[coalitionIdx];
                if (!trace) {
                    trace = {
                        x: [],
                        y: [],
                        customdata: [],
                        id: [],
                        text: [],
                        marker: { size: [] },
                    };
                    traceByCoalition[coalitionIdx] = trace;
                }

                trace.id.push(allianceId);
                trace.text.push(allianceName);

                const turn = metricAccessors.isAnyTurn ? turnOrDay : Math.floor(turnOrDay * 12);
                const day = metricAccessors.isAnyTurn ? Math.floor(turnOrDay / 12) : turnOrDay;

                for (let metricIdx = 0; metricIdx < metrics.length; metricIdx += 1) {
                    const isTurnMetric = metricAccessors.metric_is_turn[metricIdx];
                    if (!isTurnMetric && lastDay === day) continue;

                    const metricIndex = metricAccessors.metric_indexes[metricIdx];
                    const valuesByTime = isTurnMetric
                        ? coalition.turn.data[metricIndex][allianceIdx]
                        : coalition.day.data[metricIndex][allianceIdx];
                    if (!valuesByTime) continue;

                    const valuesByCity = valuesByTime[
                        isTurnMetric ? turn - turnStart : day - dayStart
                    ];
                    if (!valuesByCity || valuesByCity.length === 0) continue;

                    let total = 0;
                    for (let cityIndex = minCityIndex; cityIndex <= maxCityIndex; cityIndex += 1) {
                        total += valuesByCity[cityIndex] ?? 0;
                    }

                    const normalize = metricAccessors.metric_normalize[metricIdx];
                    if (normalize !== -1) {
                        const nationCountsByDay = coalition.day.data[0][allianceIdx];
                        if (!nationCountsByDay) continue;
                        const nationCounts = nationCountsByDay[day - dayStart];
                        if (!nationCounts || nationCounts.length === 0) continue;

                        let nations = 0;
                        if (normalize === 0) {
                            for (let cityIndex = minCityIndex; cityIndex <= maxCityIndex; cityIndex += 1) {
                                nations += nationCounts[cityIndex] ?? 0;
                            }
                        } else {
                            for (let cityIndex = minCityIndex; cityIndex <= maxCityIndex; cityIndex += 1) {
                                nations +=
                                    (nationCounts[cityIndex] ?? 0) *
                                    coalition.cities[cityIndex] *
                                    normalize;
                            }
                        }

                        if (nations !== 0) total /= nations;
                    }

                    if (metrics[metricIdx].cumulative) {
                        buffer[metricIdx] += total;
                    } else {
                        buffer[metricIdx] = total;
                    }
                }

                trace.x.push(buffer[0]);
                trace.y.push(buffer[1]);
                trace.customdata.push(buffer[2]);

                for (let rangeIndex = 0; rangeIndex < 3; rangeIndex += 1) {
                    const key = rangesKeys[rangeIndex];
                    ranges[key][0] = Math.min(ranges[key][0], buffer[rangeIndex]);
                    ranges[key][1] = Math.max(ranges[key][1], buffer[rangeIndex]);
                }

                lastDay = day;
            }
        }
    }

    if (!Number.isFinite(lookupMin) || !Number.isFinite(lookupMax)) {
        return null;
    }

    return {
        traces: lookup,
        times: {
            start: lookupMin,
            end: lookupMax,
            is_turn: metricAccessors.isAnyTurn,
        },
        ranges,
    };
}

async function computeTieringDefaultDataset(
    graphData: GraphData,
    conflictId: string,
): Promise<TieringDataSetResponse | null> {
    const worker = getTieringWarmWorker();
    const datasetKey = tieringDatasetKey(conflictId, config.version.graph_data);
    const allAllianceIds: number[][] = graphData.coalitions.map((coalition) =>
        [...coalition.alliance_ids],
    );

    if (!worker) {
        return null;
    }

    await ensureTieringDatasetReady(datasetKey, () =>
        initializeTieringDataset(datasetKey, graphData),
    );

    const workerResult = await requestWorkerRpc<
        WorkerDatasetComputeRequest<TieringWarmParams>,
        WorkerDatasetComputeResult<TieringDataSetResponse | null>
    >(
        worker,
        {
            action: "compute",
            datasetKey,
            params: {
                metrics: DEFAULT_TIERING_METRICS,
                alliance_ids: allAllianceIds,
                useSingleColor: false,
                cityBandSize: 0,
            },
        },
        {
            timeoutMs: 30_000,
            operation: "tiering warm default dataset compute",
        },
    );

    return workerResult.value;
}

function enqueueArtifact(task: ArtifactPrefetchTaskDescriptor): boolean {
    return queueArtifactPrefetch(task);
}

export function promoteArtifactTarget(routeTarget: string): void {
    promotePrefetchTarget(routeTarget, "pointerdown");
}

export function warmConflictsIndexPayload(options?: {
    priority?: PrefetchPriority;
    reason?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const version = config.version.conflicts;
    const url = getConflictsIndexUrl(version);
    return enqueueArtifact({
        key: `payload:conflicts-index:v${String(version)}`,
        artifactKind: "payload",
        reason: options?.reason ?? "route-home-idle",
        routeTarget: "/conflicts",
        intentStrength: options?.intentStrength ?? "idle",
        priority: options?.priority ?? "idle",
        estimatedBytes: 550_000,
        estimatedCpuMs: 40,
        run: async () => {
            await decompressBson(url);
        },
    });
}

export function warmConflictPayload(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const version = config.version.conflict_data;
    return enqueueArtifact({
        key: `payload:conflict:${conflictId}:v${String(version)}`,
        artifactKind: "payload",
        routeTarget: options?.routeTarget ?? "/conflict",
        reason: options?.reason ?? "route-intent",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: 900_000,
        estimatedCpuMs: 80,
        run: async () => {
            await loadConflictPayload(conflictId, version);
        },
    });
}

export function warmConflictTableArtifact(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    layouts?: ConflictTableLayoutInput[];
}): boolean {
    const layouts = options?.layouts ?? DEFAULT_CONFLICT_LAYOUTS;
    const version = config.version.conflict_data;

    return enqueueArtifact({
        key: `table:conflict:${conflictId}:v${String(version)}:${layouts.length}`,
        artifactKind: "table",
        routeTarget: options?.routeTarget ?? "/conflict",
        reason: options?.reason ?? "route-intent-table",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: 0,
        estimatedCpuMs: 260,
        run: async () => {
            const payload = await loadConflictPayload(conflictId, version);
            warmConflictTableLayouts(
                warmSourceKey(conflictId, version),
                payload,
                layouts,
            );
            incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                artifact: "table",
                routeTarget: options?.routeTarget ?? "/conflict",
            });
        },
    });
}

export function warmConflictGraphPayload(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const version = config.version.graph_data;

    return enqueueArtifact({
        key: `payload:graph:${conflictId}:v${String(version)}`,
        artifactKind: "payload",
        routeTarget: options?.routeTarget ?? "/bubble",
        reason: options?.reason ?? "route-intent-graph",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "high",
        estimatedBytes: 1_200_000,
        estimatedCpuMs: 90,
        run: async () => {
            await loadGraphPayload(conflictId, version);
        },
    });
}

export function warmBubbleDefaultArtifact(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    contextKey?: string;
    requestId?: number;
}): boolean {
    return enqueueArtifact({
        key: `bubble:default:${conflictId}:v${String(config.version.graph_data)}`,
        artifactKind: "bubble",
        routeTarget: options?.routeTarget ?? "/bubble",
        reason: options?.reason ?? "route-intent-bubble-default",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "idle",
        estimatedBytes: 0,
        estimatedCpuMs: 350,
        run: async () => {
            const graphData = await loadGraphPayload(conflictId, config.version.graph_data);
            const cacheKey = bubbleTraceKey(conflictId);
            await warmBubbleDefaultTrace({
                cacheKey,
                contextKey: options?.contextKey,
                requestId: options?.requestId,
                compute: () => computeBubbleDefaultTrace(graphData, conflictId),
            });
            incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                artifact: "bubble",
                routeTarget: options?.routeTarget ?? "/bubble",
            });
        },
    });
}

export function warmTieringDefaultArtifact(conflictId: string, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
    contextKey?: string;
    requestId?: number;
}): boolean {
    return enqueueArtifact({
        key: `tiering:default:${conflictId}:v${String(config.version.graph_data)}`,
        artifactKind: "tiering",
        routeTarget: options?.routeTarget ?? "/tiering",
        reason: options?.reason ?? "route-intent-tiering-default",
        intentStrength: options?.intentStrength ?? "hover",
        priority: options?.priority ?? "idle",
        estimatedBytes: 0,
        estimatedCpuMs: 360,
        run: async () => {
            const graphData = await loadGraphPayload(conflictId, config.version.graph_data);
            const allAllianceIds: number[][] = graphData.coalitions.map((coalition) =>
                [...coalition.alliance_ids],
            );
            const cacheKey = tieringDatasetCacheKey(conflictId, allAllianceIds);
            await warmTieringDefaultDataset({
                cacheKey,
                contextKey: options?.contextKey,
                requestId: options?.requestId,
                compute: () => computeTieringDefaultDataset(graphData, conflictId),
            });
            incrementPerfCounter("prefetch.artifact.warm.hit", 1, {
                artifact: "tiering",
                routeTarget: options?.routeTarget ?? "/tiering",
            });
        },
    });
}

export function warmCompositeContextArtifact(options: {
    ids: string[];
    aid: number;
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    const ids = options.ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .slice(0, MAX_COMPOSITE_WARM_COUNT);

    if (ids.length < 2) return false;

    const signature = getCompositeConflictSignature(ids);

    return enqueueArtifact({
        key: `composite:${signature}:aid:${options.aid}:v${String(config.version.conflict_data)}`,
        artifactKind: "composite",
        routeTarget: options.routeTarget ?? "/conflicts/view",
        reason: options.reason ?? "route-composite-resolve",
        intentStrength: options.intentStrength ?? "load",
        priority: options.priority ?? "high",
        estimatedBytes: ids.length * 900_000,
        estimatedCpuMs: 550,
        run: async () => {
            const context: ConflictRouteContext = {
                mode: "composite",
                conflictId: null,
                conflictSignature: signature,
                compositeIds: ids,
                selectedAllianceId: options.aid,
            };

            await withTimeout(
                loadConflictContext(context, config.version.conflict_data),
                COMPOSITE_WARM_TIMEOUT_MS,
            );
        },
    });
}

export function warmCompositeDefaultTableArtifact(options: {
    ids: string[];
    aid: number;
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
}): boolean {
    const signature = getCompositeConflictSignature(options.ids);
    return enqueueArtifact({
        key: `table:composite:${signature}:aid:${options.aid}:v${String(config.version.conflict_data)}`,
        artifactKind: "table",
        routeTarget: options.routeTarget ?? "/conflicts/view",
        reason: options.reason ?? "route-composite-default-table",
        intentStrength: "load",
        priority: options.priority ?? "high",
        estimatedBytes: 0,
        estimatedCpuMs: 420,
        run: async () => {
            const context: ConflictRouteContext = {
                mode: "composite",
                conflictId: null,
                conflictSignature: signature,
                compositeIds: options.ids,
                selectedAllianceId: options.aid,
            };

            const resolved = await withTimeout(
                loadConflictContext(context, config.version.conflict_data),
                COMPOSITE_WARM_TIMEOUT_MS,
            );
            warmConflictTableLayouts(
                `composite:${signature}:aid:${options.aid}:v${String(config.version.conflict_data)}`,
                resolved.conflict,
                DEFAULT_CONFLICT_LAYOUTS,
            );
        },
    });
}

export function warmRuntimeArtifact(group: RuntimePrefetchGroup, options?: {
    priority?: PrefetchPriority;
    reason?: string;
    routeTarget?: string;
    intentStrength?: ArtifactPrefetchTaskDescriptor["intentStrength"];
}): boolean {
    return enqueueArtifact({
        key: `runtime:${group}`,
        artifactKind: "runtime",
        routeTarget: options?.routeTarget ?? "/",
        reason: options?.reason ?? "runtime-warm",
        intentStrength: options?.intentStrength ?? "idle",
        priority: options?.priority ?? "idle",
        estimatedBytes: group === "plotly" ? 900_000 : 450_000,
        estimatedCpuMs: 20,
        run: async () => {
            const finish = startPerfSpan("runtime.group.warm", {
                group,
            });
            await prewarmRuntimeGroup(group);
            finish();
        },
    });
}

export function getDefaultConflictLayouts(): ConflictTableLayoutInput[] {
    return DEFAULT_CONFLICT_LAYOUTS.map((layout) => ({
        ...layout,
        columns: [...layout.columns],
    }));
}

export function getConflictTableDataFromSharedCache(
    conflictId: string,
    payload: Conflict,
    layout: ConflictTableLayoutInput,
): ReturnType<typeof getOrComputeConflictTableData> {
    return getOrComputeConflictTableData(
        warmSourceKey(conflictId, config.version.conflict_data),
        payload,
        layout,
    );
}
