import { describe, expect, it } from "vitest";
import { buildMetricTimeSeries } from "./metricTimeCompute";
import type { GraphData, TierMetric } from "./types";

const dayMetric: TierMetric = {
    name: "day_metric",
    cumulative: false,
    normalize: false,
};

const cumulativeDayMetric: TierMetric = {
    ...dayMetric,
    cumulative: true,
};

const turnMetric: TierMetric = {
    name: "turn_metric",
    cumulative: false,
    normalize: false,
};

const graphFixture: GraphData = {
    name: "Fixture",
    start: 0,
    end: 0,
    turn_start: 12,
    turn_end: 14,
    metric_names: ["nation", "day_metric", "turn_metric"],
    metrics_day: [0, 1],
    metrics_turn: [2],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101, 102],
            alliance_names: ["A", "B"],
            cities: [10],
            turn: {
                range: [12, 13],
                data: [
                    [
                        [[1], [2]],
                        [[3], [4]],
                    ],
                ],
            },
            day: {
                range: [1, 2],
                data: [
                    [
                        [[1], [1]],
                        [[1], [1]],
                    ],
                    [
                        [[2], [4]],
                        [[1], [3]],
                    ],
                ],
            },
        },
        {
            name: "Blue",
            alliance_ids: [201, 202],
            alliance_names: ["C", "D"],
            cities: [10],
            turn: {
                range: [13, 14],
                data: [
                    [
                        [[5], [6]],
                        [[7], [8]],
                    ],
                ],
            },
            day: {
                range: [2, 3],
                data: [
                    [
                        [[1], [1]],
                        [[1], [1]],
                    ],
                    [
                        [[5], [6]],
                        [[7], [8]],
                    ],
                ],
            },
        },
    ],
};

const multiCityGraphFixture: GraphData = {
    name: "Multi City Fixture",
    start: 0,
    end: 0,
    turn_start: 12,
    turn_end: 12,
    metric_names: ["nation", "day_metric"],
    metrics_day: [0, 1],
    metrics_turn: [],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101],
            alliance_names: ["A"],
            cities: [10, 20, 30],
            turn: {
                range: [12, 12],
                data: [],
            },
            day: {
                range: [1, 2],
                data: [
                    [
                        [[1, 2, 3], [10, 20, 30]],
                    ],
                    [
                        [[1, 1, 1], [2, 4, 6]],
                    ],
                ],
            },
        },
        {
            name: "Blue",
            alliance_ids: [201],
            alliance_names: ["B"],
            cities: [10, 20, 30],
            turn: {
                range: [12, 12],
                data: [],
            },
            day: {
                range: [1, 2],
                data: [
                    [
                        [[2, 2, 2], [5, 5, 5]],
                    ],
                    [
                        [[1, 1, 1], [1, 2, 3]],
                    ],
                ],
            },
        },
    ],
};

describe("metricTimeCompute", () => {
    it("builds one selected series per alliance in alliance mode", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: dayMetric,
            selectedAllianceIds: [101, 201, 202],
            aggregationMode: "alliance",
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isTurn).toBe(false);
        expect(result.timeRange).toEqual([1, 3]);
        expect(result.yDomain).toEqual([0, 8]);
        expect(result.series.map((entry) => entry.label)).toEqual(["A", "C", "D"]);
        expect(result.series[0]?.values).toEqual([2, 4, 0]);
        expect(result.series[1]?.values).toEqual([Number.NaN, 5, 6]);
        expect(result.series[2]?.values).toEqual([Number.NaN, 7, 8]);
    });

    it("rolls up only the selected alliances in coalition mode", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: dayMetric,
            selectedAllianceIds: [101, 201, 202],
            aggregationMode: "coalition",
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.series.map((entry) => entry.label)).toEqual(["Red", "Blue"]);
        expect(result.series[0]?.allianceId).toBeUndefined();
        expect(result.series[0]?.values).toEqual([2, 4, 0]);
        expect(result.series[1]?.values).toEqual([Number.NaN, 12, 14]);
    });

    it("applies cumulative accumulation after aggregation", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: cumulativeDayMetric,
            selectedAllianceIds: [101, 201, 202],
            aggregationMode: "coalition",
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.series[0]?.values).toEqual([2, 6, 6]);
        expect(result.series[1]?.values).toEqual([Number.NaN, 12, 26]);
    });

    it("uses the turn range for turn metrics", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: turnMetric,
            aggregationMode: "coalition",
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isTurn).toBe(true);
        expect(result.timeRange).toEqual([12, 14]);
        expect(result.series[0]?.values).toEqual([4, 6, 0]);
        expect(result.series[1]?.values).toEqual([Number.NaN, 12, 14]);
    });

    it("returns null when the metric does not exist", () => {
        expect(
            buildMetricTimeSeries({
                data: graphFixture,
                metric: {
                    name: "missing_metric",
                    cumulative: false,
                    normalize: false,
                },
            }),
        ).toBeNull();
    });

    it("zero-fills after a source range ends while preserving leading gaps", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: dayMetric,
            selectedAllianceIds: [101, 201],
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.series[0]?.values[2]).toBe(0);
        expect(result.series[1]?.values[0]).toBeNaN();
    });

    it("carries a sparse timeline through omitted trailing empty frames", () => {
        const sparseGraph: GraphData = {
            name: "Sparse Tail",
            start: 0,
            end: 0,
            turn_start: 12,
            turn_end: 12,
            metric_names: ["nation", "day_metric"],
            metrics_day: [0, 1],
            metrics_turn: [],
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                    alliance_names: ["A"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [],
                    },
                    day: {
                        range: [1, 3],
                        data: [
                            [
                                [[1]],
                            ],
                            [
                                [[3]],
                            ],
                        ],
                    },
                },
                {
                    name: "Blue",
                    alliance_ids: [201],
                    alliance_names: ["B"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [],
                    },
                    day: {
                        range: [1, 3],
                        data: [],
                    },
                },
            ],
        };

        const result = buildMetricTimeSeries({
            data: sparseGraph,
            metric: dayMetric,
            selectedAllianceIds: [101],
            aggregationMode: "alliance",
        });

        expect(result?.series[0]?.values).toEqual([3, 3, 3]);
    });

    it("ignores NaN gaps when building the y-domain", () => {
        const result = buildMetricTimeSeries({
            data: graphFixture,
            metric: dayMetric,
            selectedAllianceIds: [101, 201],
        });

        expect(result?.yDomain).toEqual([0, 6]);
    });

    it("terminates an alliance to zero inside its sparse range when the payload declares an end offset", () => {
        const terminatedGraph: GraphData = {
            name: "Terminated",
            start: 0,
            end: 0,
            turn_start: 12,
            turn_end: 12,
            metric_names: ["nation", "day_metric"],
            metrics_day: [0, 1],
            metrics_turn: [],
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                    alliance_names: ["A"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [],
                    },
                    day: {
                        range: [1, 3],
                        end_offsets: [1],
                        data: [
                            [
                                [[1], [], []],
                            ],
                            [
                                [[3], [], []],
                            ],
                        ],
                    },
                },
                {
                    name: "Blue",
                    alliance_ids: [201],
                    alliance_names: ["B"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [],
                    },
                    day: {
                        range: [1, 3],
                        data: [
                            [
                                [[1], [1], [1]],
                            ],
                            [
                                [[1], [1], [1]],
                            ],
                        ],
                    },
                },
            ],
        };

        const result = buildMetricTimeSeries({
            data: terminatedGraph,
            metric: dayMetric,
            selectedAllianceIds: [101],
            aggregationMode: "alliance",
        });

        expect(result?.series[0]?.values).toEqual([3, 3, 0]);
    });

    it("restricts aggregation to the selected city span", () => {
        const result = buildMetricTimeSeries({
            data: multiCityGraphFixture,
            metric: dayMetric,
            aggregationMode: "coalition",
            cityRange: [20, 30],
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.series[0]?.values).toEqual([2, 10]);
        expect(result.series[1]?.values).toEqual([2, 5]);
    });

    it("uses the selected city span for normalized numerators and denominators", () => {
        const result = buildMetricTimeSeries({
            data: multiCityGraphFixture,
            metric: {
                name: "day_metric",
                cumulative: false,
                normalize: true,
            },
            aggregationMode: "coalition",
            cityRange: [20, 30],
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.series[0]?.values).toEqual([0.4, 0.2]);
        expect(result.series[1]?.values).toEqual([0.5, 0.5]);
    });
});
