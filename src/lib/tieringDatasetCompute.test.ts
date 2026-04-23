import { describe, expect, it } from "vitest";
import { getDataSetsByTime } from "./tieringDatasetCompute";
import type { GraphCoalitionData, GraphData, TierMetric } from "./types";

function createCoalition(options: {
    name: string;
    allianceId: number;
    allianceName: string;
    nationCountsByDay: number[];
    aircraftByTurn: Array<number | null>;
}): GraphCoalitionData {
    return {
        name: options.name,
        alliance_ids: [options.allianceId],
        alliance_names: [options.allianceName],
        cities: [10],
        turn: {
            range: [5, 12],
            data: [
                [
                    options.aircraftByTurn.map((value) =>
                        value == null ? [] : [value],
                    ),
                ],
            ],
        },
        day: {
            range: [0, 1],
            data: [
                [
                    options.nationCountsByDay.map((value) => [value]),
                ],
            ],
        },
    };
}

const normalizedAircraftMetric: TierMetric = {
    name: "aircraft",
    cumulative: false,
    normalize: true,
};

const graphFixture: GraphData = {
    name: "Offset turn start fixture",
    start: 0,
    end: 0,
    turn_start: 5,
    turn_end: 12,
    metric_names: ["nation", "aircraft"],
    metrics_day: [0],
    metrics_turn: [1],
    coalitions: [
        createCoalition({
            name: "Red",
            allianceId: 101,
            allianceName: "A",
            nationCountsByDay: [1, 2],
            aircraftByTurn: [750, null, null, null, null, null, null, 1500],
        }),
        createCoalition({
            name: "Blue",
            allianceId: 201,
            allianceName: "B",
            nationCountsByDay: [1, 1],
            aircraftByTurn: [0, null, null, null, null, null, null, 0],
        }),
    ],
};

describe("tieringDatasetCompute", () => {
    it("aligns turn-normalized metrics to the absolute day instead of the coalition turn offset", () => {
        const result = getDataSetsByTime(
            graphFixture,
            [normalizedAircraftMetric],
            [[101], [201]],
            false,
            0,
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.is_turn).toBe(true);
        expect(result.time).toEqual([5, 12]);
        expect(result.data[0]?.data[0]?.[0]).toBeCloseTo(1);
        expect(result.data[0]?.data[7]?.[0]).toBeCloseTo(1);
        expect(result.data[1]?.data[7]?.[0]).toBe(0);
    });

    it("uses backend capacity metrics for researched military normalization when present", () => {
        const graphWithCapacity: GraphData = {
            name: "Capacity fixture",
            start: 0,
            end: 0,
            turn_start: 12,
            turn_end: 12,
            metric_names: ["nation", "aircraft", "aircraft_capacity"],
            metrics_day: [0, 2],
            metrics_turn: [1],
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                    alliance_names: ["A"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [[[[1050]]]],
                    },
                    day: {
                        range: [1, 1],
                        data: [
                            [[[1]]],
                            [[[1050]]],
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
                        data: [[[[0]]]],
                    },
                    day: {
                        range: [1, 1],
                        data: [
                            [[[1]]],
                            [[[750]]],
                        ],
                    },
                },
            ],
        };

        const result = getDataSetsByTime(
            graphWithCapacity,
            [normalizedAircraftMetric],
            [[101], [201]],
            false,
            0,
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.data[0]?.data[0]?.[0]).toBeCloseTo(1);
        expect(result.data[1]?.data[0]?.[0]).toBe(0);
    });

    it("zero-fills times after a coalition range ends instead of carrying the last row", () => {
        const shortRangeGraph: GraphData = {
            name: "Short range fixture",
            start: 0,
            end: 0,
            turn_start: 5,
            turn_end: 6,
            metric_names: ["nation", "aircraft"],
            metrics_day: [0],
            metrics_turn: [1],
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                    alliance_names: ["A"],
                    cities: [10],
                    turn: {
                        range: [5, 5],
                        data: [
                            [
                                [[750]],
                            ],
                        ],
                    },
                    day: {
                        range: [0, 0],
                        data: [
                            [
                                [[1]],
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
                        range: [5, 6],
                        data: [
                            [
                                [[0], [0]],
                            ],
                        ],
                    },
                    day: {
                        range: [0, 0],
                        data: [
                            [
                                [[1]],
                            ],
                        ],
                    },
                },
            ],
        };

        const result = getDataSetsByTime(
            shortRangeGraph,
            [normalizedAircraftMetric],
            [[101], [201]],
            false,
            0,
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.data[0]?.data[0]?.[0]).toBeCloseTo(1);
        expect(result.data[0]?.data[1]?.[0]).toBe(0);
    });

    it("keeps separate denominator buffers for different normalized military metrics", () => {
        const graphWithMultipleCapacityMetrics: GraphData = {
            name: "Multi-capacity fixture",
            start: 0,
            end: 0,
            turn_start: 12,
            turn_end: 12,
            metric_names: [
                "nation",
                "aircraft",
                "ship",
                "aircraft_capacity",
                "ship_capacity",
            ],
            metrics_day: [0, 3, 4],
            metrics_turn: [1, 2],
            coalitions: [
                {
                    name: "Red",
                    alliance_ids: [101],
                    alliance_names: ["A"],
                    cities: [10],
                    turn: {
                        range: [12, 12],
                        data: [
                            [[[1050]]],
                            [[[60]]],
                        ],
                    },
                    day: {
                        range: [1, 1],
                        data: [
                            [[[1]]],
                            [[[1050]]],
                            [[[60]]],
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
                        data: [
                            [[[0]]],
                            [[[0]]],
                        ],
                    },
                    day: {
                        range: [1, 1],
                        data: [
                            [[[1]]],
                            [[[750]]],
                            [[[50]]],
                        ],
                    },
                },
            ],
        };

        const result = getDataSetsByTime(
            graphWithMultipleCapacityMetrics,
            [
                normalizedAircraftMetric,
                {
                    name: "ship",
                    cumulative: false,
                    normalize: true,
                },
            ],
            [[101], [201]],
            false,
            0,
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.data[0]?.data[0]?.[0]).toBeCloseTo(1);
        expect(result.data[1]?.data[0]?.[0]).toBeCloseTo(1);
    });
});
