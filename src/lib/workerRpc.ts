type WorkerRpcSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerRpcFailure = {
    id: number;
    ok: false;
    error: string;
    details?: string[];
    kind?: string;
};

type WorkerRpcResponse<T> = WorkerRpcSuccess<T> | WorkerRpcFailure;

const workerRequestCounters = new WeakMap<Worker, number>();

export type WorkerRpcError = Error & {
    details?: string[];
    kind?: string;
};

function nextWorkerRequestId(worker: Worker): number {
    const current = workerRequestCounters.get(worker) ?? 0;
    const next = current + 1;
    workerRequestCounters.set(worker, next);
    return next;
}

export type WorkerRpcOptions = {
    timeoutMs?: number;
    operation?: string;
    transfer?: Transferable[];
};

export function requestWorkerRpc<Req extends { id: number }, Result>(
    worker: Worker,
    payload: Omit<Req, "id">,
    options?: WorkerRpcOptions,
): Promise<Result> {
    const requestId = nextWorkerRequestId(worker);
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const operation = options?.operation ?? "worker request";

    return new Promise<Result>((resolve, reject) => {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            if (timeoutHandle !== undefined) {
                clearTimeout(timeoutHandle);
            }
        };

        const onMessage = (event: MessageEvent<WorkerRpcResponse<Result>>) => {
            const response = event.data;
            if (!response || response.id !== requestId) return;
            cleanup();
            if (response.ok) {
                resolve(response.result);
            } else {
                const error = new Error(
                    response.error || `${operation} failed`,
                ) as WorkerRpcError;
                if (Array.isArray(response.details) && response.details.length > 0) {
                    error.details = response.details;
                }
                error.kind = response.kind ?? "domain";
                reject(error);
            }
        };

        const onError = (event: ErrorEvent) => {
            cleanup();
            const error = (event.error ??
                new Error(event.message || `${operation} failed`)) as WorkerRpcError;
            error.kind = error.kind ?? "transport";
            reject(error);
        };

        timeoutHandle = setTimeout(() => {
            cleanup();
            const error = new Error(
                `${operation} timed out after ${timeoutMs}ms`,
            ) as WorkerRpcError;
            error.kind = "transport";
            reject(error);
        }, timeoutMs);

        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError, { once: true });
        const message = { id: requestId, ...payload } as Req;
        if (options?.transfer && options.transfer.length > 0) {
            worker.postMessage(message, options.transfer);
            return;
        }
        worker.postMessage(message);
    });
}