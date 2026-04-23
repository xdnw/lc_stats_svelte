import { buildMetricTimeSeries } from "../lib/metricTimeCompute";
import {
    buildGraphRouteInfo,
    resolveMetricTimeAllowedAllianceIds,
    type GraphRouteInfo,
} from "../lib/graphRouteInfo";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "../lib/bubbleAggregation";
import type { CityRange } from "../lib/cityRange";
import { resolveRequestedMetricTimeMetric } from "../lib/metricTimeDefaults";
import type { MetricTimeSeriesResult } from "../lib/metricTimeCompute";
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

type MetricTimeSeriesParams = {
    metric: TierMetric;
    aggregationMode?: BubbleAggregationMode;
    requestedAllianceIds?: number[] | null;
    selectedAllianceIds?: number[];
    cityRange?: CityRange;
};

type MetricTimeVisibleBootstrapParams = {
    metric?: TierMetric | null;
    aggregationMode?: BubbleAggregationMode;
    requestedAllianceIds?: number[] | null;
    cityRange?: CityRange;
};

export type MetricTimeVisibleBootstrapRequest = {
    id: number;
    action: "bootstrapVisible";
    datasetKey: string;
    compressedBytes: ArrayBuffer;
    params: MetricTimeVisibleBootstrapParams;
};

export type MetricTimeVisibleBootstrapResult = {
    info: GraphRouteInfo;
    metric: TierMetric;
    selectedAllianceIds: number[];
    value: MetricTimeSeriesResult | null;
    timings: WorkerVisibleBootstrapTimingBreakdown;
};

type WorkerRequest =
    | WorkerDatasetInitRequest<GraphData>
    | WorkerDatasetComputeRequest<MetricTimeSeriesParams>
    | WorkerDatasetReleaseRequest
    | MetricTimeVisibleBootstrapRequest;

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result:
        | WorkerDatasetInitResult
        | WorkerDatasetReleaseResult
        | WorkerDatasetComputeResult<MetricTimeSeriesResult | null>
        | MetricTimeVisibleBootstrapResult;
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

            const info = buildGraphRouteInfo(data);
            const metric = resolveRequestedMetricTimeMetric(
                info,
                request.params.metric,
            );
            const selectedAllianceIds = Array.from(
                resolveMetricTimeAllowedAllianceIds(info, request.params.requestedAllianceIds),
            );
            const computeStart = nowMs();
            const value = buildMetricTimeSeries({
                data,
                metric,
                aggregationMode:
                    request.params.aggregationMode ??
                    DEFAULT_BUBBLE_AGGREGATION_MODE,
                selectedAllianceIds,
                cityRange: request.params.cityRange,
            });
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
                    metric,
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
            throw new Error(`metric time dataset not initialized: ${request.datasetKey}`);
        }

        const computeStart = nowMs();
        const value = buildMetricTimeSeries({
            data,
            metric: request.params.metric,
            aggregationMode:
                request.params.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE,
            selectedAllianceIds: request.params.selectedAllianceIds,
            cityRange: request.params.cityRange,
        });
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
