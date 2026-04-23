import { generateTraces } from "../lib/bubbleTraceCompute";
import {
    buildGraphRouteInfo,
    resolveInitialAllowedAllianceIds,
    type GraphRouteInfo,
} from "../lib/graphRouteInfo";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "../lib/bubbleAggregation";
import type { CityRange } from "../lib/cityRange";
import type { TraceBuildResult } from "../lib/graphDerivedCache";
import type { GraphData, TierMetric } from "../lib/types";
import type {
    WorkerVisibleBootstrapTimingBreakdown,
    WorkerDatasetComputeRequest,
    WorkerDatasetComputeResult,
    WorkerDatasetInitRequest,
    WorkerDatasetInitResult,
    WorkerDatasetReleaseRequest,
    WorkerDatasetReleaseResult,
    WorkerTimingBreakdown,
} from "../lib/workerDatasetProtocol";
import { unpackGraphDataFromCompressedBytes } from "./graphWorkerPayload";

type BubbleTraceParams = {
    metrics: [TierMetric, TierMetric, TierMetric];
    aggregationMode?: BubbleAggregationMode;
    requestedAllianceIds?: number[] | null;
    selectedAllianceIds?: number[];
    cityRange: CityRange;
};

export type BubbleVisibleBootstrapRequest = {
    id: number;
    action: "bootstrapVisible";
    datasetKey: string;
    compressedBytes: ArrayBuffer;
    params: BubbleTraceParams;
};

export type BubbleVisibleBootstrapResult = {
    info: GraphRouteInfo;
    selectedAllianceIds: number[];
    value: TraceBuildResult | null;
    timings: WorkerVisibleBootstrapTimingBreakdown;
};

type WorkerRequest =
    | WorkerDatasetInitRequest<GraphData>
    | WorkerDatasetComputeRequest<BubbleTraceParams>
    | WorkerDatasetReleaseRequest
    | BubbleVisibleBootstrapRequest;

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result:
        | WorkerDatasetInitResult
        | WorkerDatasetReleaseResult
    | WorkerDatasetComputeResult<TraceBuildResult | null>
    | BubbleVisibleBootstrapResult;
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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    const { id } = request;
    const receiveStart = nowMs();
    try {
        if (request.action === "bootstrapVisible") {
            const unpacked = await unpackGraphDataFromCompressedBytes(
                request.compressedBytes,
            );
            const { data } = unpacked;
            dataSetByKey.set(request.datasetKey, data);

            const computeStart = nowMs();
            const {
                metrics,
                aggregationMode = DEFAULT_BUBBLE_AGGREGATION_MODE,
                requestedAllianceIds,
                cityRange,
            } = request.params;
            const info = buildGraphRouteInfo(data);
            const selectedAllianceIds = Array.from(
                resolveInitialAllowedAllianceIds(info, requestedAllianceIds),
            );
            const value = generateTraces(
                data,
                metrics[0],
                metrics[1],
                metrics[2],
                cityRange,
                selectedAllianceIds,
                aggregationMode,
            );
            const respondStart = nowMs();
            const respondEnd = nowMs();
            const timings: WorkerVisibleBootstrapTimingBreakdown = {
                receiveMs: computeStart - receiveStart - unpacked.inflateMs - unpacked.unpackMs,
                inflateMs: unpacked.inflateMs,
                unpackMs: unpacked.unpackMs,
                computeMs: respondStart - computeStart,
                respondMs: respondEnd - respondStart,
                totalMs: respondEnd - receiveStart,
            };
            const response: WorkerSuccessResponse = {
                id,
                ok: true,
                result: {
                    info,
                    selectedAllianceIds,
                    value,
                    timings,
                },
            };
            self.postMessage(response);
            return;
        }

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
        const {
            metrics,
            aggregationMode = DEFAULT_BUBBLE_AGGREGATION_MODE,
            selectedAllianceIds,
            cityRange,
        } = request.params;
        const value = generateTraces(
            data,
            metrics[0],
            metrics[1],
            metrics[2],
            cityRange,
            selectedAllianceIds,
            aggregationMode,
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
