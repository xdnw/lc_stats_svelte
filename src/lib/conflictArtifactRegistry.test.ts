import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestWorkerRpc = vi.fn();
const decompressBson = vi.fn();
const generateTraces = vi.fn();
const getDataSetsByTime = vi.fn();
const buildMetricTimeSeries = vi.fn();
const hasDecompressedPayload = vi.fn();
const loadCompressedPayloadBuffer = vi.fn();
const primeCompressedPayload = vi.fn();
const hasConflictGridWorkerArtifact = vi.fn();
const warmConflictGridWorkerDataset = vi.fn();

vi.mock("./workerRpc", () => ({
    requestWorkerRpc,
}));

vi.mock("./binary", () => ({
    decompressBson,
    hasDecompressedPayload,
    loadCompressedPayloadBuffer,
    primeCompressedPayload,
}));

vi.mock("./bubbleTraceCompute", () => ({
    generateTraces,
}));

vi.mock("./tieringDatasetCompute", () => ({
    getDataSetsByTime,
}));

vi.mock("./metricTimeCompute", () => ({
    buildMetricTimeSeries,
}));

vi.mock("./conflictGrid/workerClient", () => ({
    hasConflictGridWorkerArtifact,
    warmConflictGridWorkerDataset,
}));

const graphDataFixture = {
    name: "Test Conflict",
    metric_names: ["nation", "dealt:loss_value", "loss:loss_value", "off:wars"],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101],
        },
        {
            name: "Blue",
            alliance_ids: [202],
        },
    ],
} as any;

const graphRouteInfoFixture = {
    name: "Test Conflict",
    metric_names: ["nation", "dealt:loss_value", "loss:loss_value", "off:wars"],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101],
            alliance_names: ["Red Alliance"],
        },
        {
            name: "Blue",
            alliance_ids: [202],
            alliance_names: ["Blue Alliance"],
        },
    ],
    update_ms: 12345,
} as const;

const bubbleTraceFixture = {
    traces: {
        0: {
            0: {
                x: [1],
                y: [2],
                customdata: [3],
                id: [101],
                text: ["Alliance 101"],
                marker: { size: [1] },
            },
        },
    },
    times: {
        start: 0,
        end: 0,
        is_turn: true,
    },
    ranges: {
        x: [1, 1],
        y: [2, 2],
        z: [3, 3],
    },
};

const tieringDatasetFixture = {
    data: [
        {
            group: 0,
            label: "Coalition 1",
            color: "#cc0000",
            data: [[10, 20]],
        },
    ],
    city_range: [0, 1],
    time: [0, 0],
    is_turn: false,
};

const metricTimeSeriesFixture = {
    metric: {
        name: "off:wars",
        cumulative: true,
        normalize: false,
    },
    isTurn: false,
    timeRange: [1, 3],
    yDomain: [2, 8],
    series: [
        {
            key: "alliance:0:101",
            label: "Alliance 101",
            color: "rgb(255, 0, 0)",
            coalitionIndex: 0,
            allianceId: 101,
            start: 1,
            end: 3,
            values: [2, 4, 8],
        },
    ],
};

const WorkerStub = vi.fn(class MockGraphWorker {
    terminate = vi.fn();

    constructor(..._args: unknown[]) {}
});

vi.stubGlobal("Worker", WorkerStub as unknown as typeof Worker);

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    decompressBson.mockResolvedValue(graphDataFixture);
    generateTraces.mockReturnValue(bubbleTraceFixture);
    getDataSetsByTime.mockReturnValue(tieringDatasetFixture);
    buildMetricTimeSeries.mockReturnValue(metricTimeSeriesFixture);
    hasDecompressedPayload.mockReturnValue(false);
    loadCompressedPayloadBuffer.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    primeCompressedPayload.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    hasConflictGridWorkerArtifact.mockReturnValue(false);
    warmConflictGridWorkerDataset.mockResolvedValue({ warmedLayouts: [0] });
    requestWorkerRpc.mockImplementation(
        async (_worker: Worker, payload: { action: string; datasetKey: string }) => {
            if (payload.action === "init") {
                return { ready: true };
            }
            if (payload.action === "compute" && payload.datasetKey.startsWith("bubble:")) {
                return {
                    value: bubbleTraceFixture,
                    timings: {
                        receiveMs: 1,
                        computeMs: 2,
                        respondMs: 1,
                        totalMs: 4,
                    },
                };
            }
            if (payload.action === "bootstrapVisible" && payload.datasetKey.startsWith("bubble:")) {
                return {
                    info: graphRouteInfoFixture,
                    selectedAllianceIds: [101, 202],
                    value: bubbleTraceFixture,
                    timings: {
                        receiveMs: 1,
                        inflateMs: 2,
                        unpackMs: 3,
                        computeMs: 4,
                        respondMs: 1,
                        totalMs: 11,
                    },
                };
            }
            if (payload.action === "compute" && payload.datasetKey.startsWith("tiering:")) {
                return {
                    value: tieringDatasetFixture,
                    timings: {
                        receiveMs: 1,
                        computeMs: 2,
                        respondMs: 1,
                        totalMs: 4,
                    },
                };
            }
            if (payload.action === "bootstrapVisible" && payload.datasetKey.startsWith("tiering:")) {
                return {
                    info: graphRouteInfoFixture,
                    selectedAllianceIds: [101, 202],
                    value: tieringDatasetFixture,
                    timings: {
                        receiveMs: 1,
                        inflateMs: 2,
                        unpackMs: 3,
                        computeMs: 4,
                        respondMs: 1,
                        totalMs: 11,
                    },
                };
            }
            if (payload.action === "compute" && payload.datasetKey.startsWith("metric-time:")) {
                return {
                    value: metricTimeSeriesFixture,
                    timings: {
                        receiveMs: 1,
                        computeMs: 2,
                        respondMs: 1,
                        totalMs: 4,
                    },
                };
            }
            if (payload.action === "bootstrapVisible" && payload.datasetKey.startsWith("metric-time:")) {
                return {
                    info: graphRouteInfoFixture,
                    metric: {
                        name: "off:wars",
                        cumulative: true,
                        normalize: false,
                    },
                    selectedAllianceIds: [101, 202],
                    value: metricTimeSeriesFixture,
                    timings: {
                        receiveMs: 1,
                        inflateMs: 2,
                        unpackMs: 3,
                        computeMs: 4,
                        respondMs: 1,
                        totalMs: 11,
                    },
                };
            }
            throw new Error(`Unexpected worker action: ${payload.action}`);
        },
    );
});

afterEach(async () => {
    const graphDerivedCache = await import("./graphDerivedCache");
    graphDerivedCache.invalidateGraphDerived();
});

describe("conflictArtifactRegistry", () => {
    it("prefers local bubble compute when the visible path already has graph data", async () => {
        const registry = await import("./conflictArtifactRegistry");
        const graphDerivedCache = await import("./graphDerivedCache");

        const handle = registry.acquireBubbleArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });
        const descriptor = registry.createBubbleDefaultArtifactDescriptor({
            conflictId: "123",
            version: "graph-v1",
            contextKey: "bubble:123",
            requestId: 1,
        });

        const trace = await Promise.all([
            handle.warmDefaultTrace({
                graphData: graphDataFixture,
                contextKey: "bubble:123",
                requestId: 1,
            }),
            descriptor.warm(),
        ]).then(([value]) => value);

        const bubbleCacheKey = "123:vgraph-v1|dealt:loss_value:0:1|loss:loss_value:0:1|off:wars:0:1|agg:alliance|all|all";
        expect(trace).toEqual(bubbleTraceFixture);
        expect(graphDerivedCache.getBubbleTrace(bubbleCacheKey)).toEqual(bubbleTraceFixture);
        expect(WorkerStub).toHaveBeenCalledTimes(1);
        expect(generateTraces).toHaveBeenCalledTimes(1);
        expect(requestWorkerRpc).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("warms bubble default traces through the worker bootstrap path when graph data is not local", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const descriptor = registry.createBubbleDefaultArtifactDescriptor({
            conflictId: "123",
            version: "graph-v1",
        });

        await descriptor.warm();

        expect(loadCompressedPayloadBuffer).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) =>
                payload.action === "bootstrapVisible" &&
                payload.datasetKey.startsWith("bubble:"),
            ),
        ).toHaveLength(1);
        expect(generateTraces).not.toHaveBeenCalled();
        expect(decompressBson).not.toHaveBeenCalled();
    });

    it("prefers local tiering compute when the visible path already has graph data", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const handle = registry.acquireTieringArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const dataset = await handle.warmDefaultDataset({
            graphData: graphDataFixture,
            contextKey: "tiering:123",
            requestId: 1,
        });

        expect(dataset).toEqual(tieringDatasetFixture);
        expect(getDataSetsByTime).toHaveBeenCalledTimes(1);
        expect(requestWorkerRpc).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("bootstraps bubble visible state through the worker without main-thread graph data", async () => {
        const registry = await import("./conflictArtifactRegistry");
        const graphDerivedCache = await import("./graphDerivedCache");

        const handle = registry.acquireBubbleArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const cacheKey = "123:vgraph-v1|dealt:loss_value:0:1|loss:loss_value:0:1|off:wars:0:1|agg:alliance|all|all";
        const result = await handle.bootstrapVisibleTrace({
            cacheKey,
            metrics: [
                { name: "dealt:loss_value", cumulative: true, normalize: false },
                { name: "loss:loss_value", cumulative: true, normalize: false },
                { name: "off:wars", cumulative: true, normalize: false },
            ],
            cityRange: [0, 70],
            contextKey: "bubble:123",
            requestId: 1,
        });

        expect(result).toEqual({
            info: graphRouteInfoFixture,
            selectedAllianceIds: [101, 202],
            trace: bubbleTraceFixture,
            graphData: undefined,
        });
        expect(graphDerivedCache.getBubbleTrace(cacheKey)).toEqual(bubbleTraceFixture);
        expect(loadCompressedPayloadBuffer).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(1);
        expect(decompressBson).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("recovers bubble route info when a warmed default trace exists before the visible handle", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const warmingHandle = registry.acquireBubbleArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const cacheKey = "123:vgraph-v1|dealt:loss_value:0:1|loss:loss_value:0:1|off:wars:0:1|agg:alliance|all|all";

        await warmingHandle.warmDefaultTrace({
            graphData: graphDataFixture,
            contextKey: "bubble:123:warm",
            requestId: 1,
        });
        warmingHandle.destroy();

        vi.clearAllMocks();
        decompressBson.mockResolvedValue(graphDataFixture);

        const handle = registry.acquireBubbleArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const result = await handle.bootstrapVisibleTrace({
            cacheKey,
            metrics: [
                { name: "dealt:loss_value", cumulative: true, normalize: false },
                { name: "loss:loss_value", cumulative: true, normalize: false },
                { name: "off:wars", cumulative: true, normalize: false },
            ],
            cityRange: [0, 70],
            contextKey: "bubble:123:visible",
            requestId: 2,
        });

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            selectedAllianceIds: [101, 202],
            trace: bubbleTraceFixture,
            graphData: graphDataFixture,
        });
        expect(result?.info).toMatchObject({
            name: graphDataFixture.name,
            metric_names: graphDataFixture.metric_names,
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                },
                {
                    name: "Blue",
                    alliance_ids: [202],
                },
            ],
        });
        expect(decompressBson).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(0);

        handle.destroy();
    });

    it("bootstraps tiering visible state through the worker without main-thread graph data", async () => {
        const registry = await import("./conflictArtifactRegistry");
        const graphArtifactKeys = await import("./graphArtifactKeys");

        const handle = registry.acquireTieringArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const result = await handle.bootstrapVisibleDataset({
            metrics: [{ name: "nation", cumulative: false, normalize: false }],
            useSingleColor: false,
            cityBandSize: 0,
            contextKey: "tiering:123",
            requestId: 1,
        });

        expect(result).toEqual({
            info: graphRouteInfoFixture,
            selectedAllianceIds: [101, 202],
            cacheKey: graphArtifactKeys.buildTieringDatasetCacheKey({
                conflictId: "123",
                graphVersion: "graph-v1",
                metrics: [{ name: "nation", cumulative: false, normalize: false }],
                allianceKey: "all",
                useSingleColor: false,
                cityBandSize: 0,
            }),
            dataset: tieringDatasetFixture,
            graphData: undefined,
        });
        expect(loadCompressedPayloadBuffer).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(1);
        expect(decompressBson).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("bootstraps metric-time visible state through the worker without main-thread graph data", async () => {
        const registry = await import("./conflictArtifactRegistry");
        const graphArtifactKeys = await import("./graphArtifactKeys");

        const handle = registry.acquireMetricTimeArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const metric = { name: "off:wars", cumulative: true, normalize: false } as const;
        const result = await handle.bootstrapVisibleSeries({
            metric,
            contextKey: "metric-time:123",
            requestId: 1,
        });

        expect(result).toEqual({
            info: graphRouteInfoFixture,
            selectedAllianceIds: [101, 202],
            cacheKey: graphArtifactKeys.buildMetricTimeSeriesCacheKey({
                conflictId: "123",
                graphVersion: "graph-v1",
                metric,
                allianceIds: [[101], [202]],
                defaultAllianceIds: [[101], [202]],
                aggregationMode: "alliance",
            }),
            series: metricTimeSeriesFixture,
            graphData: undefined,
        });
        expect(loadCompressedPayloadBuffer).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(1);
        expect(decompressBson).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("warms the default metric-time series through the worker bootstrap path", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const handle = registry.acquireMetricTimeArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const series = await handle.warmDefaultSeries({
            aggregationMode: "coalition",
            contextKey: "metric-time:123:warm",
            requestId: 1,
        });

        expect(series).toEqual(metricTimeSeriesFixture);
        expect(loadCompressedPayloadBuffer).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(1);
        expect(requestWorkerRpc.mock.calls.find(([, payload]) =>
            payload.action === "bootstrapVisible" &&
            payload.datasetKey.startsWith("metric-time:"),
        )?.[1]).toMatchObject({
            params: {
                metric: null,
                aggregationMode: "coalition",
            },
        });
        expect(decompressBson).not.toHaveBeenCalled();

        handle.destroy();
    });

    it("recovers tiering route info when a warmed default dataset exists before the visible handle", async () => {
        const registry = await import("./conflictArtifactRegistry");
        const graphArtifactKeys = await import("./graphArtifactKeys");

        const warmingHandle = registry.acquireTieringArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        await warmingHandle.warmDefaultDataset({
            graphData: graphDataFixture,
            contextKey: "tiering:123:warm",
            requestId: 1,
        });
        warmingHandle.destroy();

        vi.clearAllMocks();
        decompressBson.mockResolvedValue(graphDataFixture);

        const handle = registry.acquireTieringArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        const result = await handle.bootstrapVisibleDataset({
            metrics: [{ name: "nation", cumulative: false, normalize: false }],
            useSingleColor: false,
            cityBandSize: 0,
            contextKey: "tiering:123:visible",
            requestId: 2,
        });

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            selectedAllianceIds: [101, 202],
            cacheKey: graphArtifactKeys.buildTieringDatasetCacheKey({
                conflictId: "123",
                graphVersion: "graph-v1",
                metrics: [{ name: "nation", cumulative: false, normalize: false }],
                allianceKey: "all",
                useSingleColor: false,
                cityBandSize: 0,
            }),
            dataset: tieringDatasetFixture,
            graphData: graphDataFixture,
        });
        expect(result?.info).toMatchObject({
            name: graphDataFixture.name,
            metric_names: graphDataFixture.metric_names,
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                },
                {
                    name: "Blue",
                    alliance_ids: [202],
                },
            ],
        });
        expect(decompressBson).toHaveBeenCalledTimes(1);
        expect(
            requestWorkerRpc.mock.calls.filter(([, payload]) => payload.action === "bootstrapVisible"),
        ).toHaveLength(0);

        handle.destroy();
    });

    it("declares graph and conflict dependency edges explicitly", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const bubble = registry.createBubbleDefaultArtifactDescriptor({
            conflictId: "123",
            version: "graph-v1",
        });
        const tiering = registry.createTieringDefaultArtifactDescriptor({
            conflictId: "123",
            version: "graph-v1",
        });
        const grid = registry.createConflictGridArtifactDescriptor({
            conflictId: "123",
            version: "conflict-v2",
        });

        expect(bubble.dependencyEdges).toEqual([
            {
                relation: "requires",
                artifactKeys: [
                    registry.buildConflictGraphPayloadArtifactKey("123", "graph-v1"),
                ],
            },
        ]);
        expect(tiering.dependencyEdges).toEqual([
            {
                relation: "requires",
                artifactKeys: [
                    registry.buildConflictGraphPayloadArtifactKey("123", "graph-v1"),
                ],
            },
        ]);
        expect(grid.dependencyEdges).toEqual([
            {
                relation: "requires",
                artifactKeys: [
                    registry.buildConflictPayloadArtifactKey("123", "conflict-v2"),
                ],
            },
        ]);
    });

    it("loads direct graph payload handles through main-thread decompression", async () => {
        const registry = await import("./conflictArtifactRegistry");

        const bubbleHandle = registry.acquireBubbleArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });
        const tieringHandle = registry.acquireTieringArtifactHandle({
            conflictId: "123",
            version: "graph-v1",
        });

        await bubbleHandle.loadGraphData();
        await tieringHandle.loadGraphData();

        expect(decompressBson).toHaveBeenNthCalledWith(
            1,
            "https://data.locutus.link/conflicts/graphs/123.gzip?graph-v1",
            { strategy: "worker-bytes" },
        );
        expect(decompressBson).toHaveBeenNthCalledWith(
            2,
            "https://data.locutus.link/conflicts/graphs/123.gzip?graph-v1",
            { strategy: "worker-bytes" },
        );

        bubbleHandle.destroy();
        tieringHandle.destroy();
    });
});
