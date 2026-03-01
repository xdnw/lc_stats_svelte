import { getDataSetsByTime } from "../lib/tieringDatasetCompute";
import type { GraphData, TierMetric } from "../lib/types";
import type {
    WorkerDatasetComputeRequest,
    WorkerDatasetComputeResult,
    WorkerDatasetInitRequest,
    WorkerDatasetInitResult,
    WorkerDatasetReleaseRequest,
    WorkerDatasetReleaseResult,
    WorkerTimingBreakdown,
} from "../lib/workerDatasetProtocol";

type DataSetResponse = {
    data: {
        group: number;
        label: string;
        color: string;
        data: number[][];
    }[];
    city_range: [number, number];
    city_labels?: (string | number)[];
    time: [number, number];
    is_turn: boolean;
};

type TieringComputeParams = {
    metrics: TierMetric[];
    alliance_ids: number[][];
    useSingleColor: boolean;
    cityBandSize: number;
};

type WorkerRequest =
    | WorkerDatasetInitRequest<GraphData>
    | WorkerDatasetComputeRequest<TieringComputeParams>
    | WorkerDatasetReleaseRequest;

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result:
        | WorkerDatasetInitResult
        | WorkerDatasetReleaseResult
        | WorkerDatasetComputeResult<DataSetResponse | null>;
};

type WorkerErrorResponse = {
    id: number;
    ok: false;
    error: string;
};

const dataSetByKey = new Map<string, GraphData>();

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    const { id } = request;
    const receiveStart = nowMs();

    try {
        if (request.action === "init") {
            dataSetByKey.set(request.datasetKey, request.data);
            const response: WorkerSuccessResponse = {
                id,
                ok: true,
                result: { ready: true },
            };
            self.postMessage(response);
            return;
        }

        if (request.action === "release") {
            const released = dataSetByKey.delete(request.datasetKey);
            const response: WorkerSuccessResponse = {
                id,
                ok: true,
                result: { released },
            };
            self.postMessage(response);
            return;
        }

        const data = dataSetByKey.get(request.datasetKey);
        if (!data) {
            throw new Error(`tiering dataset not initialized: ${request.datasetKey}`);
        }

        const computeStart = nowMs();
        const { metrics, alliance_ids, useSingleColor, cityBandSize } = request.params;
        const value = getDataSetsByTime(
            data,
            metrics,
            alliance_ids,
            useSingleColor,
            cityBandSize,
        );

        const respondStart = nowMs();
        const respondEnd = nowMs();
        const timings: WorkerTimingBreakdown = {
            receiveMs: computeStart - receiveStart,
            computeMs: respondStart - computeStart,
            respondMs: respondEnd - respondStart,
            totalMs: respondEnd - receiveStart,
        };
        const response: WorkerSuccessResponse = {
            id,
            ok: true,
            result: {
                value,
                timings,
            },
        };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerErrorResponse = {
            id,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown worker error",
        };
        self.postMessage(response);
    }
};
