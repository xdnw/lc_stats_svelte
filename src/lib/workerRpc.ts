type WorkerRpcSuccess<T> = {
    id: number;
    ok: true;
    result: T;
};

type WorkerRpcFailure = {
    id: number;
    ok: false;
    error: string;
};

type WorkerRpcResponse<T> = WorkerRpcSuccess<T> | WorkerRpcFailure;

const workerRequestCounters = new WeakMap<Worker, number>();

function nextWorkerRequestId(worker: Worker): number {
    const current = workerRequestCounters.get(worker) ?? 0;
    const next = current + 1;
    workerRequestCounters.set(worker, next);
    return next;
}

export type WorkerRpcOptions = {
    timeoutMs?: number;
    operation?: string;
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
                reject(new Error(response.error || `${operation} failed`));
            }
        };

        const onError = (event: ErrorEvent) => {
            cleanup();
            reject(event.error ?? new Error(event.message || `${operation} failed`));
        };

        timeoutHandle = setTimeout(() => {
            cleanup();
            reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError, { once: true });
        worker.postMessage({ id: requestId, ...payload } as Req);
    });
}