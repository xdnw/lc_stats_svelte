import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { MetricCard, RankingCard, ScopeSnapshot } from "../kpi";
import { getConflictDataUrl } from "../runtime";
import { requestWorkerRpc } from "../workerRpc";
import {
    getConflictGridViewHash,
    normalizeConflictGridViewConfig,
} from "./protocol";
import type {
    ConflictGridBootstrapPayload,
    ConflictGridBootstrapRequest,
    ConflictGridDatasetRef,
    ConflictGridExportRequest,
    ConflictGridFilteredRowIdsRequest,
    ConflictGridMetricRequest,
    ConflictGridPrewarmRequest,
    ConflictGridPrewarmResult,
    ConflictGridRankingRequest,
    ConflictGridRowDetailsRequest,
    ConflictGridSelectionSnapshotRequest,
    ConflictGridSummaryQueryRequest,
    ConflictGridTableQueryRequest,
    ConflictGridViewConfig,
    ConflictKpiRankingRow,
} from "./protocol";
import { ConflictGridLayout, type ConflictGridLayoutValue } from "./rowIds";

function normalizeBasePath(basePath?: string): string {
    if (!basePath) return "";
    return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function basePathScopeKey(basePath?: string): string {
    const normalized = normalizeBasePath(basePath);
    return normalized.length > 0 ? encodeURIComponent(normalized) : "root";
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function roundElapsedMs(startedAt: number): number {
    return Math.round((nowMs() - startedAt) * 100) / 100;
}

function normalizeWarmLayouts(
    layouts?: ConflictGridLayoutValue[],
): ConflictGridLayoutValue[] {
    return (layouts && layouts.length > 0
        ? layouts
        : [ConflictGridLayout.COALITION]
    ).filter((layout, index, values) => values.indexOf(layout) === index);
}

export type ConflictGridWorkerClient = {
    readonly conflictId: string;
    readonly datasetRef: ConflictGridDatasetRef;
    bootstrap: (
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<ConflictGridBootstrapPayload>;
    query: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridPageResult>;
    querySummary: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridSummaryByColumnKey>;
    getRowDetails: (
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridPageRow | null>;
    getFilteredRowIds: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridRowId[]>;
    exportRows: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridExportResult>;
    prewarmLayouts: (
        layouts?: ConflictGridLayoutValue[],
        aggressive?: boolean,
    ) => Promise<ConflictGridPrewarmResult>;
    getSelectionSnapshot: (
        layout: ConflictGridLayoutValue,
        selectedRowIds: GridRowId[],
    ) => Promise<ScopeSnapshot>;
    getRankingRows: (card: RankingCard) => Promise<ConflictKpiRankingRow[]>;
    getMetricCardValue: (card: MetricCard) => Promise<number | null>;
    destroy: () => void;
};

function createWorker(): Worker {
    return new Worker(
        new URL("../../workers/conflictGridWorker.ts", import.meta.url),
        { type: "module" },
    );
}

function createDatasetRef(
    conflictId: string,
    version: string | number,
    basePath?: string,
): ConflictGridDatasetRef {
    const normalizedBasePath = normalizeBasePath(basePath);
    return {
        datasetKey: `conflict-grid:${conflictId}:v${String(version)}:base:${basePathScopeKey(normalizedBasePath)}`,
        conflictId,
        url: getConflictDataUrl(conflictId, version),
        version: String(version),
        basePath: normalizedBasePath,
    };
}

const SHARED_WORKER_TTL_MS = 60_000;

type SharedConflictGridHandle = {
    datasetRef: ConflictGridDatasetRef;
    isArtifactReady: (layouts?: ConflictGridLayoutValue[]) => boolean;
    acquire: () => void;
    release: () => void;
    scheduleReleaseIfIdle: () => void;
    request: <Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs?: number,
    ) => Promise<Result>;
    bootstrap: (
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<ConflictGridBootstrapPayload>;
    prewarm: (
        layouts?: ConflictGridLayoutValue[],
        aggressive?: boolean,
    ) => Promise<ConflictGridPrewarmResult>;
};

type CachedBootstrapEntry = {
    promise: Promise<ConflictGridBootstrapPayload>;
    settled: boolean;
    value: ConflictGridBootstrapPayload | null;
};

function cloneBootstrapPayload(
    payload: ConflictGridBootstrapPayload,
    zeroTimings = false,
): ConflictGridBootstrapPayload {
    return {
        ...payload,
        grid: {
            columns: payload.grid.columns,
            rowCount: payload.grid.rowCount,
        },
        timings: zeroTimings
            ? {
                  datasetCreateMs: 0,
                  layoutBootstrapMs: 0,
              }
            : {
                  ...payload.timings,
              },
    };
}

const sharedHandles = new Map<string, SharedConflictGridHandle>();

function createSharedHandle(
    datasetRef: ConflictGridDatasetRef,
): SharedConflictGridHandle {
    const worker = createWorker();
    const bootstrapByLayoutView = new Map<string, CachedBootstrapEntry>();
    const warmedLayouts = new Set<ConflictGridLayoutValue>();
    let datasetReady = false;
    let refCount = 0;
    let released = false;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    function ensureActive(): void {
        if (released) {
            throw new Error("Conflict grid worker client has been released.");
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
        bootstrapByLayoutView.clear();
        sharedHandles.delete(datasetRef.datasetKey);
        worker.terminate();
    }

    function scheduleReleaseIfIdle(): void {
        if (released || refCount > 0) return;
        clearReleaseTimer();
        releaseTimer = setTimeout(() => terminate(), SHARED_WORKER_TTL_MS);
    }

    function request<Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs = 30_000,
    ): Promise<Result> {
        ensureActive();
        return requestWorkerRpc<Request, Result>(worker, payload, {
            timeoutMs,
            operation,
        }).then((result) => {
            datasetReady = true;
            return result;
        });
    }

    function bootstrap(
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ): Promise<ConflictGridBootstrapPayload> {
        const normalizedViewConfig = normalizeConflictGridViewConfig(viewConfig);
        const cacheKey = `${layout}::${getConflictGridViewHash(normalizedViewConfig)}`;
        const cached = bootstrapByLayoutView.get(cacheKey);
        if (cached) {
            if (cached.settled && cached.value) {
                return Promise.resolve(cloneBootstrapPayload(cached.value, true));
            }
            return cached.promise;
        }

        const entry: CachedBootstrapEntry = {
            promise: Promise.resolve(null as never),
            settled: false,
            value: null,
        };

        entry.promise = request<
            ConflictGridBootstrapPayload,
            ConflictGridBootstrapRequest
        >(
            {
                action: "bootstrap",
                dataset: datasetRef,
                layout,
                viewConfig: normalizedViewConfig,
            },
            `conflict grid bootstrap (${layout})`,
            45_000,
        )
            .then((result) => {
                warmedLayouts.add(layout);
                entry.settled = true;
                entry.value = result;
                return cloneBootstrapPayload(result);
            })
            .catch((error) => {
                bootstrapByLayoutView.delete(cacheKey);
                throw error;
            });

        bootstrapByLayoutView.set(cacheKey, entry);
        return entry.promise;
    }

    function prewarm(
        layouts?: ConflictGridLayoutValue[],
        aggressive = false,
    ): Promise<ConflictGridPrewarmResult> {
        return request<ConflictGridPrewarmResult, ConflictGridPrewarmRequest>(
            {
                action: "prewarm",
                dataset: datasetRef,
                layouts,
                aggressive,
            },
            "conflict grid prewarm",
            45_000,
        ).then((result) => {
            result.warmedLayouts.forEach((layout) => warmedLayouts.add(layout));
            return result;
        });
    }

    return {
        datasetRef,
        isArtifactReady(layouts) {
            if (!datasetReady) return false;
            if (!layouts || layouts.length === 0) return true;

            return layouts.every((layout) => warmedLayouts.has(layout));
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
        request,
        bootstrap,
        prewarm,
    };
}

function getSharedHandle(options: {
    conflictId: string;
    version: string | number;
    basePath?: string;
}): SharedConflictGridHandle {
    const datasetRef = createDatasetRef(
        options.conflictId,
        options.version,
        options.basePath,
    );
    const cached = sharedHandles.get(datasetRef.datasetKey);
    if (cached) return cached;

    const nextHandle = createSharedHandle(datasetRef);
    sharedHandles.set(datasetRef.datasetKey, nextHandle);
    return nextHandle;
}

export function hasConflictGridWorkerArtifact(options: {
    conflictId: string;
    version: string | number;
    layouts?: ConflictGridLayoutValue[];
    basePath?: string;
}): boolean {
    const datasetRef = createDatasetRef(
        options.conflictId,
        options.version,
        options.basePath,
    );
    const handle = sharedHandles.get(datasetRef.datasetKey);
    if (!handle) return false;
    return handle.isArtifactReady(options.layouts);
}

export function warmConflictGridWorkerDataset(options: {
    conflictId: string;
    version: string | number;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
    basePath?: string;
}): Promise<ConflictGridPrewarmResult> {
    const handle = getSharedHandle(options);
    const aggressive = options.aggressive ?? false;
    if (aggressive) {
        return handle
            .prewarm(options.layouts, true)
            .finally(() => handle.scheduleReleaseIfIdle());
    }

    const layouts = normalizeWarmLayouts(options.layouts);
    const startedAt = nowMs();

    return Promise.all(layouts.map((layout) => handle.bootstrap(layout)))
        .then(() => ({
            datasetKey: handle.datasetRef.datasetKey,
            warmedLayouts: layouts,
            metricVectorsWarmed: 0,
            elapsedMs: roundElapsedMs(startedAt),
        }))
        .finally(() => handle.scheduleReleaseIfIdle());
}

export function createConflictGridWorkerClient(options: {
    conflictId: string;
    version: string | number;
    basePath?: string;
    getViewConfig?: (() => ConflictGridViewConfig | null | undefined) | undefined;
}): ConflictGridWorkerClient {
    const handle = getSharedHandle(options);
    handle.acquire();
    const datasetRef = handle.datasetRef;
    let released = false;

    function ensureOwned(): void {
        if (released) {
            throw new Error("Conflict grid worker client has been released.");
        }
    }

    function resolveViewConfig(
        viewConfig?: ConflictGridViewConfig | null,
    ): ConflictGridViewConfig {
        return normalizeConflictGridViewConfig(viewConfig ?? options.getViewConfig?.());
    }

    return {
        conflictId: options.conflictId,
        datasetRef,
        bootstrap(layout, viewConfig) {
            ensureOwned();
            return handle.bootstrap(layout, resolveViewConfig(viewConfig));
        },
        query(layout, state, viewConfig) {
            ensureOwned();
            return handle.request<GridPageResult, ConflictGridTableQueryRequest>(
                {
                    action: "tableQuery",
                    dataset: datasetRef,
                    layout,
                    state,
                    viewConfig: resolveViewConfig(viewConfig),
                },
                `conflict grid query (${layout})`,
            );
        },
        querySummary(layout, state, viewConfig) {
            ensureOwned();
            return handle.request<GridSummaryByColumnKey, ConflictGridSummaryQueryRequest>(
                {
                    action: "summaryQuery",
                    dataset: datasetRef,
                    layout,
                    state,
                    viewConfig: resolveViewConfig(viewConfig),
                },
                `conflict grid summary (${layout})`,
            );
        },
        getRowDetails(layout, rowId, state, viewConfig) {
            ensureOwned();
            return handle.request<GridPageRow | null, ConflictGridRowDetailsRequest>(
                {
                    action: "rowDetails",
                    dataset: datasetRef,
                    layout,
                    rowId,
                    state,
                    viewConfig: resolveViewConfig(viewConfig),
                },
                `conflict grid row details (${layout})`,
            );
        },
        getFilteredRowIds(layout, state, viewConfig) {
            ensureOwned();
            return handle.request<GridRowId[], ConflictGridFilteredRowIdsRequest>(
                {
                    action: "filteredRowIds",
                    dataset: datasetRef,
                    layout,
                    state,
                    viewConfig: resolveViewConfig(viewConfig),
                },
                `conflict grid filtered row ids (${layout})`,
            );
        },
        exportRows(layout, state, viewConfig) {
            ensureOwned();
            return handle.request<GridExportResult, ConflictGridExportRequest>(
                {
                    action: "export",
                    dataset: datasetRef,
                    layout,
                    state,
                    viewConfig: resolveViewConfig(viewConfig),
                },
                `conflict grid export (${layout})`,
                45_000,
            );
        },
        prewarmLayouts(layouts, aggressive) {
            ensureOwned();
            return handle.prewarm(layouts, aggressive ?? false);
        },
        getSelectionSnapshot(layout, selectedRowIds) {
            ensureOwned();
            return handle.request<ScopeSnapshot, ConflictGridSelectionSnapshotRequest>(
                {
                    action: "selectionSnapshot",
                    dataset: datasetRef,
                    layout,
                    selectedRowIds,
                },
                `conflict grid selection snapshot (${layout})`,
            );
        },
        getRankingRows(card) {
            ensureOwned();
            return handle.request<ConflictKpiRankingRow[], ConflictGridRankingRequest>(
                {
                    action: "ranking",
                    dataset: datasetRef,
                    card,
                },
                "conflict grid ranking KPI",
            );
        },
        getMetricCardValue(card) {
            ensureOwned();
            return handle.request<number | null, ConflictGridMetricRequest>(
                {
                    action: "metric",
                    dataset: datasetRef,
                    card,
                },
                "conflict grid metric KPI",
            );
        },
        destroy() {
            if (released) return;
            released = true;
            handle.release();
        },
    };
}
