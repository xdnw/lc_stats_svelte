import { decompressBson } from "../binary";
import {
    collectCompositeAllianceCandidates,
    selectDefaultCompositeAllianceId,
    buildNoCommonCompositeAllianceDetails,
    type LoadedCompositeConflict,
} from "../compositeConflictSelection";
import { createConflictGridDataset } from "../conflictGrid/dataset";
import type { ConflictGridPrewarmResult } from "../conflictGrid/protocol";
import type { ConflictGridLayoutValue } from "../conflictGrid/rowIds";
import { mergeCompositeConflict } from "../compositeMerge";
import type { Conflict } from "../types";
import {
    createCompositeConflictGridDatasetRef,
    createCompositeConflictGridSourceConflicts,
} from "./datasetRef";
import type {
    CompositeConflictGridBootstrapPayload,
    CompositeConflictGridDatasetRef,
    CompositeConflictGridResolveResult,
} from "./protocol";
import type {
    CompositeConflictGridClient,
    CompositeConflictGridSession,
} from "./types";

type LoadedCompositeResult = {
    loaded: LoadedCompositeConflict[];
    failedConflictIds: string[];
};

type EnsuredDataset = {
    dataset: ReturnType<typeof createConflictGridDataset>;
    createdNow: boolean;
    payload: CompositeConflictGridBootstrapPayload["composite"];
};

async function loadConflictPayloads(
    conflictIds: string[],
    version: string,
    maxConcurrency = 4,
): Promise<LoadedCompositeResult> {
    const sourceConflicts = createCompositeConflictGridSourceConflicts(
        conflictIds,
        version,
    );
    const loadedByIndex = new Array<LoadedCompositeConflict | null>(
        sourceConflicts.length,
    ).fill(null);
    const failedByIndex = new Array<string | null>(sourceConflicts.length).fill(null);
    let index = 0;

    const workers = Array.from(
        { length: Math.min(maxConcurrency, sourceConflicts.length) },
        async () => {
            while (index < sourceConflicts.length) {
                const current = index;
                index += 1;
                const conflict = sourceConflicts[current];
                try {
                    const payload = (await decompressBson(conflict.url)) as Conflict;
                    loadedByIndex[current] = { id: conflict.id, data: payload };
                } catch {
                    failedByIndex[current] = conflict.id;
                }
            }
        },
    );

    await Promise.all(workers);
    return {
        loaded: loadedByIndex.filter(
            (entry): entry is LoadedCompositeConflict => entry != null,
        ),
        failedConflictIds: failedByIndex.filter(
            (entry): entry is string => entry != null,
        ),
    };
}

function resolveCompositeOptions(options: {
    signature: string;
    conflictIds: string[];
    loaded: LoadedCompositeConflict[];
    failedConflictIds: string[];
}): CompositeConflictGridResolveResult {
    const allianceOptions = collectCompositeAllianceCandidates(
        options.loaded,
        options.conflictIds,
    );

    return {
        signature: options.signature,
        resolvedConflictIds: options.loaded.map((entry) => entry.id),
        failedConflictIds: [...options.failedConflictIds],
        allianceOptions,
        defaultAllianceId: selectDefaultCompositeAllianceId(
            allianceOptions,
            options.loaded,
            options.conflictIds,
        ),
        noCommonAllianceDetails:
            allianceOptions.length === 0
                ? buildNoCommonCompositeAllianceDetails(options.loaded)
                : [],
    };
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

export function createLocalCompositeConflictGridSession(options: {
    signature: string;
    conflictIds: string[];
    version: string;
    basePath?: string;
}): CompositeConflictGridSession {
    const datasets = new Map<string, EnsuredDataset>();
    const pendingDatasets = new Map<string, Promise<EnsuredDataset>>();
    const bootstrapByLayout = new Map<string, Promise<CompositeConflictGridBootstrapPayload>>();

    let resolvePromise: Promise<CompositeConflictGridResolveResult> | null = null;
    let loadPromise: Promise<LoadedCompositeResult> | null = null;

    async function ensureLoaded(): Promise<LoadedCompositeResult> {
        if (!loadPromise) {
            loadPromise = loadConflictPayloads(options.conflictIds, options.version);
        }
        return loadPromise;
    }

    async function resolve(): Promise<CompositeConflictGridResolveResult> {
        if (!resolvePromise) {
            resolvePromise = ensureLoaded().then((loaded) =>
                resolveCompositeOptions({
                    signature: options.signature,
                    conflictIds: options.conflictIds,
                    loaded: loaded.loaded,
                    failedConflictIds: loaded.failedConflictIds,
                }),
            );
        }
        return resolvePromise;
    }

    async function ensureDataset(datasetRef: CompositeConflictGridDatasetRef): Promise<EnsuredDataset> {
        const cached = datasets.get(datasetRef.datasetKey);
        if (cached) return cached;

        const pending = pendingDatasets.get(datasetRef.datasetKey);
        if (pending) return pending;

        const nextPending = ensureLoaded()
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
                const next: EnsuredDataset = {
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
                datasets.set(datasetRef.datasetKey, next);
                pendingDatasets.delete(datasetRef.datasetKey);
                return next;
            })
            .catch((error) => {
                pendingDatasets.delete(datasetRef.datasetKey);
                throw error;
            });

        pendingDatasets.set(datasetRef.datasetKey, nextPending);
        return nextPending;
    }

    function createClient(selectedAllianceId: number): CompositeConflictGridClient {
        const datasetRef = createCompositeConflictGridDatasetRef({
            signature: options.signature,
            conflictIds: options.conflictIds,
            selectedAllianceId,
            version: options.version,
            basePath: options.basePath,
        });
        let released = false;

        function ensureOwned(): void {
            if (released) {
                throw new Error("Composite conflict grid client has been released.");
            }
        }

        async function bootstrap(
            layout: ConflictGridLayoutValue,
        ): Promise<CompositeConflictGridBootstrapPayload> {
            ensureOwned();
            const bootstrapKey = `${datasetRef.datasetKey}|${layout}`;
            const cached = bootstrapByLayout.get(bootstrapKey);
            if (cached) return cached;

            const pending = ensureDataset(datasetRef)
                .then((ensured) => {
                    const isNew = ensured.createdNow;
                    const payload = createBootstrapPayload({
                        datasetRef,
                        layout,
                        ensured,
                    });
                    if (!isNew) {
                        payload.timings.datasetCreateMs = 0;
                    }
                    ensured.createdNow = false;
                    return payload;
                })
                .catch((error) => {
                    bootstrapByLayout.delete(bootstrapKey);
                    throw error;
                });

            bootstrapByLayout.set(bootstrapKey, pending);
            return pending;
        }

        async function getDataset() {
            ensureOwned();
            const ensured = await ensureDataset(datasetRef);
            ensured.createdNow = false;
            return ensured.dataset;
        }

        return {
            conflictId: options.signature,
            datasetRef,
            bootstrap,
            async query(layout, state) {
                const dataset = await getDataset();
                return dataset.query(layout, state);
            },
            async querySummary(layout, state) {
                const dataset = await getDataset();
                return dataset.querySummary(layout, state);
            },
            async getRowDetails(layout, rowId, state) {
                const dataset = await getDataset();
                return dataset.getRowDetails(layout, rowId, state);
            },
            async getFilteredRowIds(layout, state) {
                const dataset = await getDataset();
                return dataset.getFilteredRowIds(layout, state);
            },
            async exportRows(layout, state) {
                const dataset = await getDataset();
                return dataset.exportRows(layout, state);
            },
            async prewarmLayouts(layouts, aggressive) {
                const dataset = await getDataset();
                return dataset.prewarm(layouts, aggressive ?? false) as ConflictGridPrewarmResult;
            },
            destroy() {
                released = true;
            },
        };
    }

    return {
        resolve,
        createClient,
        destroy() {
            datasets.clear();
            pendingDatasets.clear();
            bootstrapByLayout.clear();
        },
    };
}
