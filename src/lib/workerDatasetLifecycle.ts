import { requestWorkerRpc } from "./workerRpc";
import type {
    WorkerDatasetReleaseRequest,
    WorkerDatasetReleaseResult,
} from "./workerDatasetProtocol";

export function createModuleWorker(
    workerUrl: URL,
    unavailableMessage: string,
): Worker | null {
    try {
        return new Worker(workerUrl, { type: "module" });
    } catch (error) {
        console.warn(unavailableMessage, error);
        return null;
    }
}

export function releaseWorkerDataset(
    worker: Worker | null,
    datasetKey: string | null,
    operation: string,
    timeoutMs = 2_000,
): void {
    if (!worker || !datasetKey) return;
    void requestWorkerRpc<
        WorkerDatasetReleaseRequest,
        WorkerDatasetReleaseResult
    >(
        worker,
        {
            action: "release",
            datasetKey,
        },
        {
            timeoutMs,
            operation,
        },
    ).catch(() => {});
}

export function terminateWorker(worker: Worker | null): void {
    if (!worker) return;
    worker.terminate();
}
