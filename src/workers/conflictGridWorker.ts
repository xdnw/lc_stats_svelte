import { createConflictGridDataset } from "../lib/conflictGrid/dataset";
import { createAppUnpackr } from "../lib/msgpack";
import type {
    ConflictGridWorkerRequest,
    ConflictGridDatasetRef,
} from "../lib/conflictGrid/protocol";
import type { Conflict } from "../lib/types";

const unpackr = createAppUnpackr();

type ConflictGridDataset = ReturnType<typeof createConflictGridDataset>;

type EnsuredDataset = {
    dataset: ConflictGridDataset;
    createdNow: boolean;
};

type WorkerSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerFailure = {
    id: number;
    ok: false;
    error: string;
};

const datasetCache = new Map<string, ConflictGridDataset>();
const pendingDatasetLoads = new Map<string, Promise<EnsuredDataset>>();

async function fetchConflict(url: string): Promise<Conflict> {
    const response = await fetch(url);
    if (!response.body) {
        throw new Error("Response body is null");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return unpackr.unpack(new Uint8Array(arrayBuffer)) as Conflict;
}

async function ensureDataset(
    datasetRef: ConflictGridDatasetRef,
) : Promise<EnsuredDataset> {
    const cached = datasetCache.get(datasetRef.datasetKey);
    if (cached) {
        return {
            dataset: cached,
            createdNow: false,
        };
    }

    const pending = pendingDatasetLoads.get(datasetRef.datasetKey);
    if (pending) return pending;

    const nextPending = fetchConflict(datasetRef.url)
        .then((data) => {
            const dataset = createConflictGridDataset({
                datasetKey: datasetRef.datasetKey,
                conflictId: datasetRef.conflictId,
                data,
                aavaRouteContext: {
                    routeKind: "single",
                    basePath: datasetRef.basePath,
                },
            });
            datasetCache.set(datasetRef.datasetKey, dataset);
            pendingDatasetLoads.delete(datasetRef.datasetKey);
            return {
                dataset,
                createdNow: true,
            };
        })
        .catch((error) => {
            pendingDatasetLoads.delete(datasetRef.datasetKey);
            throw error;
        });

    pendingDatasetLoads.set(datasetRef.datasetKey, nextPending);
    return nextPending;
}

async function handleRequest(request: ConflictGridWorkerRequest): Promise<unknown> {
    if (request.action === "release") {
        pendingDatasetLoads.delete(request.datasetKey);
        return {
            released: datasetCache.delete(request.datasetKey),
        };
    }

    const ensured = await ensureDataset(request.dataset);
    const dataset = ensured.dataset;

    switch (request.action) {
        case "bootstrap": {
            const payload = dataset.bootstrap(request.layout, request.viewConfig);
            return {
                ...payload,
                timings: {
                    datasetCreateMs: ensured.createdNow ? dataset.creationMs : 0,
                    layoutBootstrapMs: payload.timings.layoutBootstrapMs,
                },
            };
        }
        case "tableQuery":
            return dataset.query(request.layout, request.state, request.viewConfig);
        case "summaryQuery":
            return dataset.querySummary(
                request.layout,
                request.state,
                request.viewConfig,
            );
        case "rowDetails":
            return dataset.getRowDetails(
                request.layout,
                request.rowId,
                request.state,
                request.viewConfig,
            );
        case "filteredRowIds":
            return dataset.getFilteredRowIds(
                request.layout,
                request.state,
                request.viewConfig,
            );
        case "export":
            return dataset.exportRows(
                request.layout,
                request.state,
                request.viewConfig,
            );
        case "selectionSnapshot":
            return dataset.getSelectionSnapshot(
                request.layout,
                request.selectedRowIds,
            );
        case "ranking":
            return dataset.getRankingRows(request.card);
        case "metric":
            return dataset.getMetricCardValue(request.card);
        case "prewarm":
            return dataset.prewarm(request.layouts, request.aggressive ?? false);
    }
}

self.onmessage = async (event: MessageEvent<ConflictGridWorkerRequest>) => {
    const request = event.data;
    const startedAt = typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    try {
        const result = await handleRequest(request);
        const endedAt = typeof performance !== "undefined"
            ? performance.now()
            : Date.now();
        if (import.meta.env.DEV) {
            console.debug("[conflictGridWorker]", request.action, {
                elapsedMs: Math.round((endedAt - startedAt) * 100) / 100,
                datasetKey:
                    "dataset" in request
                        ? request.dataset.datasetKey
                        : request.datasetKey,
            });
        }
        const response: WorkerSuccess<unknown> = {
            id: request.id,
            ok: true,
            result,
        };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerFailure = {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : "Conflict grid worker failed",
        };
        self.postMessage(response);
    }
};
