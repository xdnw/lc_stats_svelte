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
const workerRpcStates = new WeakMap<Worker, WorkerRpcState>();

export type WorkerRpcError = Error & {
    details?: string[];
    kind?: string;
};

type PendingWorkerRpc = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    cleanup: () => void;
    operation: string;
};

type WorkerRpcState = {
    pending: Map<number, PendingWorkerRpc>;
    onMessage: (event: MessageEvent<WorkerRpcResponse<unknown>>) => void;
};

function nextWorkerRequestId(worker: Worker): number {
    const current = workerRequestCounters.get(worker) ?? 0;
    const next = current + 1;
    workerRequestCounters.set(worker, next);
    return next;
}

function createWorkerRpcError(
    response: WorkerRpcFailure,
    operation: string,
): WorkerRpcError {
    const error = new Error(response.error || `${operation} failed`) as WorkerRpcError;
    if (Array.isArray(response.details) && response.details.length > 0) {
        error.details = response.details;
    }
    error.kind = response.kind ?? "domain";
    return error;
}

function getWorkerRpcState(worker: Worker): WorkerRpcState {
    const existing = workerRpcStates.get(worker);
    if (existing) return existing;

    const state: WorkerRpcState = {
        pending: new Map(),
        onMessage(event) {
            const response = event.data;
            if (!response) return;
            const pending = state.pending.get(response.id);
            if (!pending) return;
            pending.cleanup();
            if (response.ok) {
                pending.resolve(response.result);
                return;
            }
            pending.reject(createWorkerRpcError(response, pending.operation));
        },
    };
    worker.addEventListener("message", state.onMessage);
    workerRpcStates.set(worker, state);
    return state;
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
    const state = getWorkerRpcState(worker);

    return new Promise<Result>((resolve, reject) => {
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
            state.pending.delete(requestId);
            worker.removeEventListener("error", onError);
            if (timeoutHandle !== undefined) {
                clearTimeout(timeoutHandle);
            }
        };

        const onError = (event: ErrorEvent) => {
            cleanup();
            const error = (event.error ??
                new Error(event.message || `${operation} failed`)) as WorkerRpcError;
            error.kind = error.kind ?? "transport";
            reject(error);
        };

        state.pending.set(requestId, {
            resolve: resolve as (value: unknown) => void,
            reject,
            cleanup,
            operation,
        });

        timeoutHandle = setTimeout(() => {
            cleanup();
            const error = new Error(
                `${operation} timed out after ${timeoutMs}ms`,
            ) as WorkerRpcError;
            error.kind = "transport";
            reject(error);
        }, timeoutMs);

        worker.addEventListener("error", onError, { once: true });
        const message = { id: requestId, ...payload } as Req;
        if (options?.transfer && options.transfer.length > 0) {
            worker.postMessage(message, options.transfer);
            return;
        }
        worker.postMessage(message);
    });
}
