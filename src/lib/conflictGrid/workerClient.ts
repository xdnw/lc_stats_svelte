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
    ConflictKpiRankingRow,
} from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";

export type ConflictGridWorkerClient = {
    readonly conflictId: string;
    readonly datasetRef: ConflictGridDatasetRef;
    bootstrap: (
        layout: ConflictGridLayoutValue,
    ) => Promise<ConflictGridBootstrapPayload>;
    query: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridPageResult>;
    querySummary: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridSummaryByColumnKey>;
    getRowDetails: (
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
    ) => Promise<GridPageRow | null>;
    getFilteredRowIds: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridRowId[]>;
    exportRows: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
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
): ConflictGridDatasetRef {
    return {
        datasetKey: `conflict-grid:${conflictId}:v${String(version)}`,
        conflictId,
        url: getConflictDataUrl(conflictId, version),
        version: String(version),
    };
}

const SHARED_WORKER_TTL_MS = 60_000;

type SharedConflictGridHandle = {
    datasetRef: ConflictGridDatasetRef;
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
    ) => Promise<ConflictGridBootstrapPayload>;
    prewarm: (
        layouts?: ConflictGridLayoutValue[],
        aggressive?: boolean,
    ) => Promise<ConflictGridPrewarmResult>;
};

const sharedHandles = new Map<string, SharedConflictGridHandle>();

function createSharedHandle(
    datasetRef: ConflictGridDatasetRef,
): SharedConflictGridHandle {
    const worker = createWorker();
    const bootstrapByLayout = new Map<
        ConflictGridLayoutValue,
        Promise<ConflictGridBootstrapPayload>
    >();
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
        bootstrapByLayout.clear();
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
        });
    }

    function bootstrap(
        layout: ConflictGridLayoutValue,
    ): Promise<ConflictGridBootstrapPayload> {
        const cached = bootstrapByLayout.get(layout);
        if (cached) return cached;

        const pending = request<
            ConflictGridBootstrapPayload,
            ConflictGridBootstrapRequest
        >(
            {
                action: "bootstrap",
                dataset: datasetRef,
                layout,
            },
            `conflict grid bootstrap (${layout})`,
            45_000,
        ).catch((error) => {
            bootstrapByLayout.delete(layout);
            throw error;
        });

        bootstrapByLayout.set(layout, pending);
        return pending;
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
        );
    }

    return {
        datasetRef,
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
}): SharedConflictGridHandle {
    const datasetRef = createDatasetRef(options.conflictId, options.version);
    const cached = sharedHandles.get(datasetRef.datasetKey);
    if (cached) return cached;

    const nextHandle = createSharedHandle(datasetRef);
    sharedHandles.set(datasetRef.datasetKey, nextHandle);
    return nextHandle;
}

export function warmConflictGridWorkerDataset(options: {
    conflictId: string;
    version: string | number;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
}): Promise<ConflictGridPrewarmResult> {
    const handle = getSharedHandle(options);
    return handle
        .prewarm(options.layouts, options.aggressive ?? false)
        .finally(() => handle.scheduleReleaseIfIdle());
}

export function createConflictGridWorkerClient(options: {
    conflictId: string;
    version: string | number;
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

    return {
        conflictId: options.conflictId,
        datasetRef,
        bootstrap(layout) {
            ensureOwned();
            return handle.bootstrap(layout);
        },
        query(layout, state) {
            ensureOwned();
            return handle.request<GridPageResult, ConflictGridTableQueryRequest>(
                {
                    action: "tableQuery",
                    dataset: datasetRef,
                    layout,
                    state,
                },
                `conflict grid query (${layout})`,
            );
        },
        querySummary(layout, state) {
            ensureOwned();
            return handle.request<GridSummaryByColumnKey, ConflictGridSummaryQueryRequest>(
                {
                    action: "summaryQuery",
                    dataset: datasetRef,
                    layout,
                    state,
                },
                `conflict grid summary (${layout})`,
            );
        },
        getRowDetails(layout, rowId, state) {
            ensureOwned();
            return handle.request<GridPageRow | null, ConflictGridRowDetailsRequest>(
                {
                    action: "rowDetails",
                    dataset: datasetRef,
                    layout,
                    rowId,
                    state,
                },
                `conflict grid row details (${layout})`,
            );
        },
        getFilteredRowIds(layout, state) {
            ensureOwned();
            return handle.request<GridRowId[], ConflictGridFilteredRowIdsRequest>(
                {
                    action: "filteredRowIds",
                    dataset: datasetRef,
                    layout,
                    state,
                },
                `conflict grid filtered row ids (${layout})`,
            );
        },
        exportRows(layout, state) {
            ensureOwned();
            return handle.request<GridExportResult, ConflictGridExportRequest>(
                {
                    action: "export",
                    dataset: datasetRef,
                    layout,
                    state,
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
