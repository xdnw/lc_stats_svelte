import { buildAavaSnapshotKey } from "./cacheKeys";
import {
    buildAavaSelectionRowsFromSource,
    type AavaSelectionRow,
    type AavaSelectionSnapshot,
    type AavaSelectionSource,
} from "./aavaSelection";
import { requestWorkerRpc } from "./workerRpc";
import type { WorkerRpcError } from "./workerRpc";

export type AavaSelectionBuildRequest = {
    id: number;
    action: "buildRows";
    dataKey: string;
    snapshot: AavaSelectionSnapshot;
};

export type AavaSelectionInitRequest = {
    id: number;
    action: "init";
    dataKey: string;
    source: AavaSelectionSource;
};

export type AavaSelectionReleaseRequest = {
    id: number;
    action: "release";
    dataKey: string;
};

export type AavaSelectionWorkerRequest =
    | AavaSelectionInitRequest
    | AavaSelectionBuildRequest
    | AavaSelectionReleaseRequest;

export type AavaSelectionEngine = {
    peekRows: (snapshot: AavaSelectionSnapshot) => AavaSelectionRow[] | null;
    buildRows: (snapshot: AavaSelectionSnapshot) => Promise<AavaSelectionRow[]>;
    destroy: () => void;
};

type WorkerAwareError = Error & {
    details?: string[];
    kind?: string;
};

function createWorkerUnavailableError(): WorkerAwareError {
    const error = new Error("AAvA selection worker unavailable") as WorkerAwareError;
    error.kind = "worker-unavailable";
    return error;
}

function shouldFallbackAavaSelectionWorker(error: unknown): boolean {
    const kind = (error as WorkerRpcError | undefined)?.kind;
    return kind === "worker-unavailable" || kind === "transport" || kind === "runtime";
}

function createLocalAavaSelectionEngine(source: AavaSelectionSource): AavaSelectionEngine {
    const cache = new Map<string, AavaSelectionRow[]>();

    return {
        peekRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            return cache.get(cacheKey) ?? null;
        },
        async buildRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            const cached = cache.get(cacheKey);
            if (cached) return cached;
            const rows = buildAavaSelectionRowsFromSource(source, snapshot);
            cache.set(cacheKey, rows);
            return rows;
        },
        destroy() {
            cache.clear();
        },
    };
}

function createWorkerAavaSelectionEngine(options: {
    dataKey: string;
    source: AavaSelectionSource;
}): AavaSelectionEngine {
    let worker: Worker | null;
    try {
        worker = new Worker(new URL("../workers/aavaSelectionWorker.ts", import.meta.url), {
            type: "module",
        });
    } catch {
        throw createWorkerUnavailableError();
    }

    let released = false;
    let initPromise: Promise<void> | null = null;
    const cache = new Map<string, {
        promise: Promise<AavaSelectionRow[]>;
        rows: AavaSelectionRow[] | null;
    }>();

    function ensureOwned(): Worker {
        if (released || !worker) {
            throw createWorkerUnavailableError();
        }
        return worker;
    }

    function ensureInitialized(): Promise<void> {
        if (!initPromise) {
            const activeWorker = ensureOwned();
            initPromise = requestWorkerRpc<AavaSelectionInitRequest, { ready: true }>(
                activeWorker,
                {
                    action: "init",
                    dataKey: options.dataKey,
                    source: options.source,
                },
                {
                    timeoutMs: 30_000,
                    operation: "aava selection init",
                },
            ).then(() => undefined);
        }
        return initPromise;
    }

    return {
        peekRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            return cache.get(cacheKey)?.rows ?? null;
        },
        async buildRows(snapshot) {
            const cacheKey = buildAavaSnapshotKey(snapshot);
            const cached = cache.get(cacheKey);
            if (cached) return cached.promise;

            const pending = ensureInitialized()
                .then(() =>
                    requestWorkerRpc<AavaSelectionBuildRequest, AavaSelectionRow[]>(
                        ensureOwned(),
                        {
                            action: "buildRows",
                            dataKey: options.dataKey,
                            snapshot,
                        },
                        {
                            timeoutMs: 30_000,
                            operation: "aava selection build rows",
                        },
                    ),
                )
                .then((rows) => {
                    const cachedEntry = cache.get(cacheKey);
                    if (cachedEntry) {
                        cachedEntry.rows = rows;
                    }
                    return rows;
                })
                .catch((error) => {
                    cache.delete(cacheKey);
                    throw error;
                });

            cache.set(cacheKey, {
                promise: pending,
                rows: null,
            });
            return pending;
        },
        destroy() {
            if (released) return;
            released = true;
            cache.clear();
            if (worker) {
                void requestWorkerRpc<AavaSelectionReleaseRequest, { released: boolean }>(
                    worker,
                    {
                        action: "release",
                        dataKey: options.dataKey,
                    },
                    {
                        timeoutMs: 2_000,
                        operation: "aava selection release",
                    },
                ).catch(() => {});
                worker.terminate();
            }
            worker = null;
        },
    };
}

export function createAavaSelectionEngine(options: {
    dataKey: string;
    source: AavaSelectionSource;
}): AavaSelectionEngine {
    const local = createLocalAavaSelectionEngine(options.source);
    let active: AavaSelectionEngine = local;
    let workerEngine: AavaSelectionEngine | null = null;

    try {
        workerEngine = createWorkerAavaSelectionEngine(options);
        active = workerEngine;
    } catch (error) {
        if (!shouldFallbackAavaSelectionWorker(error)) {
            throw error;
        }
        return local;
    }

    return {
        peekRows(snapshot) {
            return active.peekRows(snapshot) ?? null;
        },
        async buildRows(snapshot) {
            try {
                return await active.buildRows(snapshot);
            } catch (error) {
                if (!shouldFallbackAavaSelectionWorker(error) || active === local) {
                    throw error;
                }
                active.destroy();
                if (workerEngine === active) {
                    workerEngine = null;
                }
                active = local;
                return active.buildRows(snapshot);
            }
        },
        destroy() {
            active.destroy();
            if (workerEngine && workerEngine !== active) {
                workerEngine.destroy();
            }
            if (active !== local) {
                local.destroy();
            }
        },
    };
}
