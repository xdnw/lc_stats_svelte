export type WorkerTimingBreakdown = {
    receiveMs: number;
    computeMs: number;
    respondMs: number;
    totalMs: number;
};

export type WorkerVisibleBootstrapTimingBreakdown = {
    receiveMs: number;
    inflateMs: number;
    unpackMs: number;
    computeMs: number;
    respondMs: number;
    totalMs: number;
};

export type WorkerDatasetInitRequest<TData> = {
    id: number;
    action: "init";
    datasetKey: string;
    data: TData;
};

export type WorkerDatasetComputeRequest<TParams> = {
    id: number;
    action: "compute";
    datasetKey: string;
    params: TParams;
};

export type WorkerDatasetReleaseRequest = {
    id: number;
    action: "release";
    datasetKey: string;
};

export type WorkerDatasetInitResult = {
    ready: true;
};

export type WorkerDatasetComputeResult<TValue> = {
    value: TValue;
    timings: WorkerTimingBreakdown;
};

export type WorkerDatasetReleaseResult = {
    released: boolean;
};
