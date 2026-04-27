import {
    buildNoCommonCompositeAllianceDetails,
    collectCompositeAllianceCandidates,
    selectDefaultCompositeAllianceId,
    type LoadedCompositeConflict,
} from "../lib/compositeConflictSelection";
import { createConflictGridDataset } from "../lib/conflictGrid/dataset";
import type { ConflictGridLayoutValue } from "../lib/conflictGrid/rowIds";
import {
    isCompositeMergeError,
    mergeCompositeConflict,
} from "../lib/compositeMerge";
import type {
    CompositeConflictGridBootstrapPayload,
    CompositeConflictGridDatasetRef,
    CompositeConflictGridResolveRequest,
    CompositeConflictGridResolveResult,
    CompositeConflictGridWorkerRequest,
} from "../lib/compositeConflictGrid/protocol";
import { createAppUnpackr } from "../lib/msgpack";
import type { Conflict } from "../lib/types";

const unpackr = createAppUnpackr();

type ConflictGridDataset = ReturnType<typeof createConflictGridDataset>;

type WorkerSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerFailure = {
    id: number;
    ok: false;
    error: string;
    details?: string[];
    kind?: "domain" | "runtime";
};

type LoadedCompositeResult = {
    loaded: LoadedCompositeConflict[];
    failedConflictIds: string[];
};

type EnsuredDataset = {
    dataset: ConflictGridDataset;
    createdNow: boolean;
    payload: CompositeConflictGridBootstrapPayload["composite"];
};

const loadedCompositeCache = new Map<string, LoadedCompositeResult>();
const pendingLoadedComposite = new Map<string, Promise<LoadedCompositeResult>>();
const datasetCache = new Map<string, EnsuredDataset>();
const pendingDatasets = new Map<string, Promise<EnsuredDataset>>();

function getLoadKey(signature: string, version: string): string {
    return `composite-grid-load:${signature}:v${version}`;
}

async function fetchConflict(url: string): Promise<Conflict> {
    const response = await fetch(url);
    if (!response.body) {
        throw new Error("Response body is null");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return unpackr.unpack(new Uint8Array(arrayBuffer)) as Conflict;
}

function buildResolveResult(
    request: CompositeConflictGridResolveRequest,
    loadedResult: LoadedCompositeResult,
): CompositeConflictGridResolveResult {
    const orderedConflictIds = request.conflicts.map((conflict) => conflict.id);
    const allianceOptions = collectCompositeAllianceCandidates(
        loadedResult.loaded,
        orderedConflictIds,
    );

    return {
        signature: request.signature,
        resolvedConflictIds: loadedResult.loaded.map((entry) => entry.id),
        failedConflictIds: [...loadedResult.failedConflictIds],
        allianceOptions,
        defaultAllianceId: selectDefaultCompositeAllianceId(
            allianceOptions,
            loadedResult.loaded,
            orderedConflictIds,
        ),
        noCommonAllianceDetails:
            allianceOptions.length === 0
                ? buildNoCommonCompositeAllianceDetails(loadedResult.loaded)
                : [],
    };
}

async function ensureLoaded(
    request: CompositeConflictGridResolveRequest,
): Promise<LoadedCompositeResult> {
    const loadKey = getLoadKey(request.signature, request.version);
    const cached = loadedCompositeCache.get(loadKey);
    if (cached) return cached;

    const pending = pendingLoadedComposite.get(loadKey);
    if (pending) return pending;

    const nextPending = (async () => {
        const loadedByIndex = new Array<LoadedCompositeConflict | null>(
            request.conflicts.length,
        ).fill(null);
        const failedByIndex = new Array<string | null>(request.conflicts.length).fill(null);
        let index = 0;

        const workers = Array.from(
            { length: Math.min(4, request.conflicts.length) },
            async () => {
                while (index < request.conflicts.length) {
                    const current = index;
                    index += 1;
                    const conflict = request.conflicts[current];
                    try {
                        const payload = await fetchConflict(conflict.url);
                        loadedByIndex[current] = { id: conflict.id, data: payload };
                    } catch {
                        failedByIndex[current] = conflict.id;
                    }
                }
            },
        );

        await Promise.all(workers);
        const result = {
            loaded: loadedByIndex.filter(
                (entry): entry is LoadedCompositeConflict => entry != null,
            ),
            failedConflictIds: failedByIndex.filter(
                (entry): entry is string => entry != null,
            ),
        };
        loadedCompositeCache.set(loadKey, result);
        pendingLoadedComposite.delete(loadKey);
        return result;
    })().catch((error) => {
        pendingLoadedComposite.delete(loadKey);
        throw error;
    });

    pendingLoadedComposite.set(loadKey, nextPending);
    return nextPending;
}

function createResolveRequestFromDataset(
    datasetRef: CompositeConflictGridDatasetRef,
): CompositeConflictGridResolveRequest {
    return {
        id: 0,
        action: "resolve",
        signature: datasetRef.signature,
        conflicts: datasetRef.conflicts,
        version: datasetRef.version,
    };
}

async function ensureDataset(
    datasetRef: CompositeConflictGridDatasetRef,
): Promise<EnsuredDataset> {
    const cached = datasetCache.get(datasetRef.datasetKey);
    if (cached) {
        return {
            ...cached,
            createdNow: false,
        };
    }

    const pending = pendingDatasets.get(datasetRef.datasetKey);
    if (pending) return pending;

    const nextPending = ensureLoaded(createResolveRequestFromDataset(datasetRef))
        .then((loadedResult) => {
            if (loadedResult.loaded.length < 2) {
                throw new Error(
                    "At least two conflicts must load successfully to build a composite conflict.",
                );
            }

            const merged = mergeCompositeConflict(
                loadedResult.loaded,
                datasetRef.selectedAllianceId,
            );
            const dataset = createConflictGridDataset({
                datasetKey: datasetRef.datasetKey,
                conflictId: datasetRef.signature,
                data: merged.conflict,
                aavaRouteContext: {
                    routeKind: "composite",
                    compositeIds: datasetRef.conflicts.map((conflict) => conflict.id),
                    selectedAllianceId: datasetRef.selectedAllianceId,
                    basePath: datasetRef.basePath,
                },
            });
            const ensured: EnsuredDataset = {
                dataset,
                createdNow: true,
                payload: {
                    diagnostics: merged.diagnostics,
                    warnings: [
                        ...merged.diagnostics.warnings,
                        ...merged.diagnostics.aavaIncompatibilities,
                    ],
                    resolvedConflictIds: loadedResult.loaded.map((entry) => entry.id),
                    failedConflictIds: [...loadedResult.failedConflictIds],
                    selectedAllianceId: datasetRef.selectedAllianceId,
                },
            };
            datasetCache.set(datasetRef.datasetKey, ensured);
            pendingDatasets.delete(datasetRef.datasetKey);
            return ensured;
        })
        .catch((error) => {
            pendingDatasets.delete(datasetRef.datasetKey);
            throw error;
        });

    pendingDatasets.set(datasetRef.datasetKey, nextPending);
    return nextPending;
}

function createBootstrapPayload(options: {
    datasetRef: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    ensured: EnsuredDataset;
}): CompositeConflictGridBootstrapPayload {
    const bootstrap = options.ensured.dataset.bootstrap(options.layout);
    return {
        ...bootstrap,
        datasetKey: options.datasetRef.datasetKey,
        timings: {
            datasetCreateMs: options.ensured.createdNow
                ? options.ensured.dataset.creationMs
                : 0,
            layoutBootstrapMs: bootstrap.timings.layoutBootstrapMs,
        },
        composite: options.ensured.payload,
    };
}

async function handleRequest(
    request: CompositeConflictGridWorkerRequest,
): Promise<unknown> {
    switch (request.action) {
        case "resolve": {
            const loadedResult = await ensureLoaded(request);
            return buildResolveResult(request, loadedResult);
        }
        case "bootstrap": {
            const ensured = await ensureDataset(request.dataset);
            const payload = createBootstrapPayload({
                datasetRef: request.dataset,
                layout: request.layout,
                ensured,
            });
            if (ensured.createdNow) {
                const cached = datasetCache.get(request.dataset.datasetKey);
                if (cached) {
                    cached.createdNow = false;
                }
            }
            return payload;
        }
        case "tableQuery": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.query(request.layout, request.state);
        }
        case "summaryQuery": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.querySummary(request.layout, request.state);
        }
        case "rowDetails": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.getRowDetails(
                request.layout,
                request.rowId,
                request.state,
            );
        }
        case "filteredRowIds": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.getFilteredRowIds(request.layout, request.state);
        }
        case "export": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.exportRows(request.layout, request.state);
        }
        case "prewarm": {
            const ensured = await ensureDataset(request.dataset);
            ensured.createdNow = false;
            return ensured.dataset.prewarm(request.layouts, request.aggressive ?? false);
        }
    }
}

self.onmessage = async (event: MessageEvent<CompositeConflictGridWorkerRequest>) => {
    const request = event.data;
    try {
        const result = await handleRequest(request);
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
            error: error instanceof Error
                ? error.message
                : "Composite conflict grid worker failed",
            details: isCompositeMergeError(error) ? error.details : undefined,
            kind: isCompositeMergeError(error) ? "domain" : "runtime",
        };
        self.postMessage(response);
    }
};
