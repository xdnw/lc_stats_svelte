import { incrementPerfCounter, startPerfSpan } from "./perf";
import { getConflictDataUrl } from "./runtime";
import { requestWorkerRpc } from "./workerRpc";
import type {
    CompositeContextWorkerRequest,
    CompositeContextWorkerResult,
} from "../workers/compositeContextWorker";

type FetchAndMergeRequest = Extract<
    CompositeContextWorkerRequest,
    { action: "fetchAndMerge" }
>;

type WorkerAwareError = Error & {
    details?: string[];
    kind?: string;
};

let compositeContextWorker: Worker | null = null;
let compositeContextWorkerFailed = false;

function createWorkerUnavailableError(): WorkerAwareError {
    const error = new Error("Composite context worker unavailable") as WorkerAwareError;
    error.kind = "worker-unavailable";
    return error;
}

function resetCompositeContextWorker(): void {
    compositeContextWorker?.terminate();
    compositeContextWorker = null;
}

function getCompositeContextWorker(): Worker | null {
    if (compositeContextWorkerFailed) return null;
    if (compositeContextWorker) return compositeContextWorker;

    try {
        compositeContextWorker = new Worker(
            new URL("../workers/compositeContextWorker.ts", import.meta.url),
            { type: "module" },
        );
        incrementPerfCounter("composite.context.worker.created", 1, {
            owner: "compositeContextWorker",
        });
        return compositeContextWorker;
    } catch {
        compositeContextWorkerFailed = true;
        incrementPerfCounter("composite.context.worker.unavailable", 1, {
            owner: "compositeContextWorker",
        });
        return null;
    }
}

async function requestCompositeContext(
    payload: Omit<FetchAndMergeRequest, "id">,
    operation: string,
): Promise<CompositeContextWorkerResult> {
    const worker = getCompositeContextWorker();
    if (!worker) {
        throw createWorkerUnavailableError();
    }

    const finishSpan = startPerfSpan("compositeContext.worker.total", {
        action: payload.action,
    });

    try {
        const result = await requestWorkerRpc<
            CompositeContextWorkerRequest,
            CompositeContextWorkerResult
        >(worker, payload, {
            timeoutMs: 60_000,
            operation,
        });
        incrementPerfCounter("composite.context.worker.success", 1, {
            action: payload.action,
        });
        return result;
    } catch (error) {
        const typedError = error as WorkerAwareError;
        if (typedError.kind === "transport" || typedError.kind === "runtime") {
            resetCompositeContextWorker();
        }
        incrementPerfCounter("composite.context.worker.failure", 1, {
            action: payload.action,
            kind: typedError.kind ?? "domain",
        });
        throw typedError;
    } finally {
        finishSpan();
    }
}

export function resolveCompositeContextInWorker(options: {
    signature: string;
    conflictIds: string[];
    conflictDataVersion: string | number;
    selectedAllianceId: number;
}): Promise<CompositeContextWorkerResult> {
    const payload: Omit<FetchAndMergeRequest, "id"> = {
        action: "fetchAndMerge",
        signature: options.signature,
        conflicts: options.conflictIds.map((id) => ({
            id,
            url: getConflictDataUrl(id, options.conflictDataVersion),
        })),
        selectedAllianceId: options.selectedAllianceId,
    };

    return requestCompositeContext(
        payload,
        "composite context fetch+merge",
    );
}
