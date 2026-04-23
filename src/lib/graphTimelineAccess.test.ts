import { describe, expect, it } from "vitest";
import { readGraphTimelineSnapshot } from "./graphTimelineAccess";
import { buildMetricTimeSeries } from "./metricTimeCompute";
import type { GraphData, TierMetric } from "./types";

const dayMetric: TierMetric = {
    name: "nation",
    cumulative: false,
    normalize: false,
};

const patchGraphFixture: GraphData = {
    name: "Patch Fixture",
    start: 0,
    end: 0,
    turn_start: 12,
    turn_end: 14,
    metric_names: ["nation", "soldier"],
    metrics_day: [0],
    metrics_turn: [1],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101],
            alliance_names: ["A"],
            cities: [10, 11],
            turn: {
                range: [12, 14],
                data: [
                    [
                        [
                            [50, 30],
                            [],
                            [20, null as unknown as number],
                        ],
                    ],
                ],
            },
            day: {
                range: [1, 4],
                data: [
                    [
                        [
                            [2, 3],
                            [],
                            [1, null as unknown as number],
                            [0, 1],
                        ],
                    ],
                ],
            },
        },
        {
            name: "Blue",
            alliance_ids: [201],
            alliance_names: ["B"],
            cities: [10, 11],
            turn: {
                range: [12, 14],
                data: [
                    [
                        [
                            [],
                            [10, 5],
                            [],
                        ],
                    ],
                ],
            },
            day: {
                range: [1, 4],
                data: [
                    [
                        [
                            [],
                            [4, 1],
                            [],
                            [null as unknown as number, 2],
                        ],
                    ],
                ],
            },
        },
    ],
};

describe("graphTimelineAccess", () => {
    it("reconstructs patch frames lazily without expanding untouched timelines", () => {
        const coalition = patchGraphFixture.coalitions[0];

        expect(
            readGraphTimelineSnapshot({
                coalition,
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 0,
            }),
        ).toEqual([2, 3]);
        expect(
            readGraphTimelineSnapshot({
                coalition,
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 1,
            }),
        ).toEqual([2, 3]);
        expect(
            readGraphTimelineSnapshot({
                coalition,
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 2,
            }),
        ).toEqual([1, 3]);
        expect(
            readGraphTimelineSnapshot({
                coalition: patchGraphFixture.coalitions[1],
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 0,
            }),
        ).toEqual([]);
    });

    it("returns a synthetic zero frame after the declared alliance end offset", () => {
        const coalition = {
            ...patchGraphFixture.coalitions[0],
            day: {
                ...patchGraphFixture.coalitions[0].day,
                end_offsets: [2],
            },
        };

        expect(
            readGraphTimelineSnapshot({
                coalition,
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 2,
            }),
        ).toEqual([1, 3]);
        expect(
            readGraphTimelineSnapshot({
                coalition,
                allianceIndex: 0,
                isTurnMetric: false,
                metricIndex: 0,
                timeIndex: 3,
            }),
        ).toEqual([0, 0]);
    });

    it("lets metric-time consume raw patch payloads without whole-payload hydration", () => {
        const result = buildMetricTimeSeries({
            data: patchGraphFixture,
            metric: dayMetric,
            aggregationMode: "coalition",
        });

        expect(result?.series[0]?.values).toEqual([5, 5, 4, 1]);
        expect(result?.series[1]?.values).toEqual([Number.NaN, 5, 5, 6]);
    });
});
