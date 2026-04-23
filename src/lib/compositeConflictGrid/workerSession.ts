import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { ConflictGridPrewarmResult } from "../conflictGrid/protocol";
import type { ConflictGridLayoutValue } from "../conflictGrid/rowIds";
import { requestWorkerRpc } from "../workerRpc";
import type { WorkerRpcError } from "../workerRpc";
import {
    createCompositeConflictGridDatasetRef,
    createCompositeConflictGridSourceConflicts,
} from "./datasetRef";
import type {
    CompositeConflictGridBootstrapPayload,
    CompositeConflictGridBootstrapRequest,
    CompositeConflictGridDatasetRef,
    CompositeConflictGridExportRequest,
    CompositeConflictGridFilteredRowIdsRequest,
    CompositeConflictGridPrewarmRequest,
    CompositeConflictGridResolveRequest,
    CompositeConflictGridResolveResult,
    CompositeConflictGridRowDetailsRequest,
    CompositeConflictGridSummaryQueryRequest,
    CompositeConflictGridTableQueryRequest,
} from "./protocol";
import type {
    CompositeConflictGridClient,
    CompositeConflictGridSession,
} from "./types";

type WorkerAwareError = Error & {
    details?: string[];
    kind?: string;
};

type SharedCompositeGridHandle = {
    acquire: () => void;
    release: () => void;
    resolve: () => Promise<CompositeConflictGridResolveResult>;
    bootstrap: (
        datasetRef: CompositeConflictGridDatasetRef,
        layout: ConflictGridLayoutValue,
    ) => Promise<CompositeConflictGridBootstrapPayload>;
    request: <Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs?: number,
    ) => Promise<Result>;
};

const SHARED_WORKER_TTL_MS = 60_000;
const sharedHandles = new Map<string, SharedCompositeGridHandle>();

function createWorker(): Worker {
    return new Worker(
        new URL("../../workers/compositeConflictGridWorker.ts", import.meta.url),
        { type: "module" },
    );
}

function createWorkerUnavailableError(): WorkerAwareError {
    const error = new Error(
        "Composite conflict grid worker unavailable",
    ) as WorkerAwareError;
    error.kind = "worker-unavailable";
    return error;
}

function createSharedHandle(options: {
    signature: string;
    conflictIds: string[];
    version: string;
}): SharedCompositeGridHandle {
    let worker: Worker | null;
    try {
        worker = createWorker();
    } catch {
        worker = null;
    }

    const workerKey = `composite-grid:${options.signature}:v${options.version}`;
    const bootstrapByLayout = new Map<
        string,
        Promise<CompositeConflictGridBootstrapPayload>
    >();
    let resolvePromise: Promise<CompositeConflictGridResolveResult> | null = null;
    let refCount = 0;
    let released = false;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;

    function ensureActiveWorker(): Worker {
        if (released || !worker) {
            throw createWorkerUnavailableError();
        }
        return worker;
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
        resolvePromise = null;
        bootstrapByLayout.clear();
        sharedHandles.delete(workerKey);
        worker?.terminate();
        worker = null;
    }

    function scheduleReleaseIfIdle(): void {
        if (released || refCount > 0) return;
        clearReleaseTimer();
        releaseTimer = setTimeout(() => terminate(), SHARED_WORKER_TTL_MS);
    }

    async function request<Result, Request extends { id: number }>(
        payload: Omit<Request, "id">,
        operation: string,
        timeoutMs = 45_000,
    ): Promise<Result> {
        const activeWorker = ensureActiveWorker();
        try {
            return await requestWorkerRpc<Request, Result>(activeWorker, payload, {
                timeoutMs,
                operation,
            });
        } catch (error) {
            const typedError = error as WorkerAwareError;
            if (typedError.kind === "transport" || typedError.kind === "runtime") {
                terminate();
            }
            throw typedError;
        }
    }

    return {
        acquire() {
            if (released || !worker) {
                throw createWorkerUnavailableError();
            }
            refCount += 1;
            clearReleaseTimer();
        },
        release() {
            if (released) return;
            refCount = Math.max(0, refCount - 1);
            scheduleReleaseIfIdle();
        },
        resolve() {
            if (!resolvePromise) {
                resolvePromise = request<
                    CompositeConflictGridResolveResult,
                    CompositeConflictGridResolveRequest
                >(
                    {
                        action: "resolve",
                        signature: options.signature,
                        conflicts: createCompositeConflictGridSourceConflicts(
                            options.conflictIds,
                            options.version,
                        ),
                        version: options.version,
                    },
                    "composite conflict resolve",
                    60_000,
                ).catch((error) => {
                    resolvePromise = null;
                    throw error;
                });
            }
            return resolvePromise;
        },
        bootstrap(datasetRef, layout) {
            const bootstrapKey = `${datasetRef.datasetKey}|${layout}`;
            const cached = bootstrapByLayout.get(bootstrapKey);
            if (cached) return cached;

            const pending = request<
                CompositeConflictGridBootstrapPayload,
                CompositeConflictGridBootstrapRequest
            >(
                {
                    action: "bootstrap",
                    dataset: datasetRef,
                    layout,
                },
                `composite conflict bootstrap (${layout})`,
                60_000,
            ).catch((error) => {
                bootstrapByLayout.delete(bootstrapKey);
                throw error;
            });

            bootstrapByLayout.set(bootstrapKey, pending);
            return pending;
        },
        request,
    };
}

function getSharedHandle(options: {
    signature: string;
    conflictIds: string[];
    version: string;
}): SharedCompositeGridHandle {
    const workerKey = `composite-grid:${options.signature}:v${options.version}`;
    const cached = sharedHandles.get(workerKey);
    if (cached) return cached;
    const nextHandle = createSharedHandle(options);
    sharedHandles.set(workerKey, nextHandle);
    return nextHandle;
}

export function createWorkerCompositeConflictGridSession(options: {
    signature: string;
    conflictIds: string[];
    version: string;
}): CompositeConflictGridSession {
    const handle = getSharedHandle(options);
    handle.acquire();
    let released = false;

    function ensureOwned(): void {
        if (released) {
            throw createWorkerUnavailableError();
        }
    }

    function createClient(selectedAllianceId: number): CompositeConflictGridClient {
        const datasetRef = createCompositeConflictGridDatasetRef({
            signature: options.signature,
            conflictIds: options.conflictIds,
            selectedAllianceId,
            version: options.version,
        });
        let clientReleased = false;

        function ensureClientOwned(): void {
            ensureOwned();
            if (clientReleased) {
                throw new Error("Composite conflict grid client has been released.");
            }
        }

        return {
            conflictId: options.signature,
            datasetRef,
            bootstrap(layout) {
                ensureClientOwned();
                return handle.bootstrap(datasetRef, layout);
            },
            query(layout, state) {
                ensureClientOwned();
                return handle.request<GridPageResult, CompositeConflictGridTableQueryRequest>(
                    {
                        action: "tableQuery",
                        dataset: datasetRef,
                        layout,
                        state,
                    },
                    `composite conflict query (${layout})`,
                );
            },
            querySummary(layout, state) {
                ensureClientOwned();
                return handle.request<
                    GridSummaryByColumnKey,
                    CompositeConflictGridSummaryQueryRequest
                >(
                    {
                        action: "summaryQuery",
                        dataset: datasetRef,
                        layout,
                        state,
                    },
                    `composite conflict summary (${layout})`,
                );
            },
            getRowDetails(layout, rowId, state) {
                ensureClientOwned();
                return handle.request<
                    GridPageRow | null,
                    CompositeConflictGridRowDetailsRequest
                >(
                    {
                        action: "rowDetails",
                        dataset: datasetRef,
                        layout,
                        rowId,
                        state,
                    },
                    `composite conflict row details (${layout})`,
                );
            },
            getFilteredRowIds(layout, state) {
                ensureClientOwned();
                return handle.request<
                    GridRowId[],
                    CompositeConflictGridFilteredRowIdsRequest
                >(
                    {
                        action: "filteredRowIds",
                        dataset: datasetRef,
                        layout,
                        state,
                    },
                    `composite conflict filtered row ids (${layout})`,
                );
            },
            exportRows(layout, state) {
                ensureClientOwned();
                return handle.request<
                    GridExportResult,
                    CompositeConflictGridExportRequest
                >(
                    {
                        action: "export",
                        dataset: datasetRef,
                        layout,
                        state,
                    },
                    `composite conflict export (${layout})`,
                    60_000,
                );
            },
            prewarmLayouts(layouts, aggressive) {
                ensureClientOwned();
                return handle.request<
                    ConflictGridPrewarmResult,
                    CompositeConflictGridPrewarmRequest
                >(
                    {
                        action: "prewarm",
                        dataset: datasetRef,
                        layouts,
                        aggressive,
                    },
                    "composite conflict prewarm",
                    60_000,
                );
            },
            destroy() {
                clientReleased = true;
            },
        };
    }

    return {
        resolve() {
            ensureOwned();
            return handle.resolve();
        },
        createClient,
        destroy() {
            if (released) return;
            released = true;
            handle.release();
        },
    };
}

export function shouldFallbackCompositeConflictGridWorker(error: unknown): boolean {
    const kind = (error as WorkerRpcError | undefined)?.kind;
    return kind === "worker-unavailable" || kind === "transport" || kind === "runtime";
}
