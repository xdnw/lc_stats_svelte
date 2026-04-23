import { afterEach, describe, expect, it, vi } from "vitest";
import {
    hasMetricTimeSeries,
    hasTieringDataset,
    invalidateGraphDerived,
    warmMetricTimeSeries,
    warmTieringDefaultDataset,
    type MetricTimeSeriesResult,
    type TieringDataSetResponse,
} from "./graphDerivedCache";
import { clearPerfSnapshot, getPerfSnapshot } from "./perf";

const tieringDatasetFixture: TieringDataSetResponse = {
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

const metricTimeSeriesFixture: MetricTimeSeriesResult = {
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
            label: "Alpha",
            color: "rgb(255, 0, 0)",
            coalitionIndex: 0,
            allianceId: 101,
            start: 1,
            end: 3,
            values: [2, 4, 8],
        },
    ],
};

afterEach(() => {
    clearPerfSnapshot();
    invalidateGraphDerived();
});

describe("graphDerivedCache", () => {
    it("dedupes concurrent tiering dataset computation and stores the shared result", async () => {
        let releaseCompute = () => {};
        const computeGate = new Promise<void>((resolve) => {
            releaseCompute = () => resolve();
        });
        const compute = vi.fn(async () => {
            await computeGate;
            return tieringDatasetFixture;
        });

        const first = warmTieringDefaultDataset({
            cacheKey: "tiering:test:v1",
            compute,
        });
        const second = warmTieringDefaultDataset({
            cacheKey: "tiering:test:v1",
            compute,
        });

        releaseCompute();

        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(compute).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(tieringDatasetFixture);
        expect(secondResult).toEqual(tieringDatasetFixture);
        expect(hasTieringDataset("tiering:test:v1")).toBe(true);
        expect(
            getPerfSnapshot().counters.filter(
                (counter) =>
                    counter.name === "graph.tiering.cache.pending" &&
                    counter.tags?.owner === "warmGraphDerivedValue",
            ),
        ).toHaveLength(1);
    });

    it("records a cache hit when the warm path reuses a stored dataset", async () => {
        const compute = vi.fn(async () => tieringDatasetFixture);

        await warmTieringDefaultDataset({
            cacheKey: "tiering:test:v2",
            compute,
        });

        clearPerfSnapshot();

        const cachedCompute = vi.fn(async () => {
            throw new Error("cached tiering dataset should not recompute");
        });

        const result = await warmTieringDefaultDataset({
            cacheKey: "tiering:test:v2",
            compute: cachedCompute,
        });

        expect(result).toEqual(tieringDatasetFixture);
        expect(cachedCompute).not.toHaveBeenCalled();
        expect(
            getPerfSnapshot().counters.filter(
                (counter) =>
                    counter.name === "graph.tiering.cache.hit" &&
                    counter.tags?.owner === "warmGraphDerivedValue",
            ),
        ).toHaveLength(1);
    });

    it("dedupes concurrent metric-time computation and stores the shared result", async () => {
        let releaseCompute = () => {};
        const computeGate = new Promise<void>((resolve) => {
            releaseCompute = () => resolve();
        });
        const compute = vi.fn(async () => {
            await computeGate;
            return metricTimeSeriesFixture;
        });

        const first = warmMetricTimeSeries({
            cacheKey: "metric-time:test:v1",
            compute,
        });
        const second = warmMetricTimeSeries({
            cacheKey: "metric-time:test:v1",
            compute,
        });

        releaseCompute();

        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(compute).toHaveBeenCalledTimes(1);
        expect(firstResult).toEqual(metricTimeSeriesFixture);
        expect(secondResult).toEqual(metricTimeSeriesFixture);
        expect(hasMetricTimeSeries("metric-time:test:v1")).toBe(true);
    });
});
