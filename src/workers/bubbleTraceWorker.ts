import { generateTraces } from "../lib/bubbleTraceCompute";
import type { TraceBuildResult } from "../lib/graphDerivedCache";
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

type BubbleTraceParams = {
    metrics: [TierMetric, TierMetric, TierMetric];
    minCity: number;
    maxCity: number;
};

type WorkerRequest =
    | WorkerDatasetInitRequest<GraphData>
    | WorkerDatasetComputeRequest<BubbleTraceParams>
    | WorkerDatasetReleaseRequest;

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result:
        | WorkerDatasetInitResult
        | WorkerDatasetReleaseResult
        | WorkerDatasetComputeResult<TraceBuildResult | null>;
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
            throw new Error(`bubble dataset not initialized: ${request.datasetKey}`);
        }

        const computeStart = nowMs();
        const { metrics, minCity, maxCity } = request.params;
        const value = generateTraces(
            data,
            metrics[0],
            metrics[1],
            metrics[2],
            minCity,
            maxCity,
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
