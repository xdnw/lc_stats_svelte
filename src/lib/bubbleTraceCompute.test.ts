import { describe, expect, it } from "vitest";
import { generateTraces } from "./bubbleTraceCompute";
import type { GraphData, TierMetric } from "./types";

const metricX: TierMetric = {
    name: "soldier",
    cumulative: false,
    normalize: true,
};

const metricY: TierMetric = {
    name: "off:wars",
    cumulative: false,
    normalize: false,
};

const metricSize: TierMetric = {
    name: "turn_metric",
    cumulative: true,
    normalize: false,
};

const graphFixture: GraphData = {
    name: "Fixture",
    start: 0,
    end: 0,
    turn_start: 12,
    turn_end: 13,
    metric_names: ["nation", "soldier", "off:wars", "turn_metric"],
    metrics_day: [0, 1, 2],
    metrics_turn: [3],
    coalitions: [
        {
            name: "Red",
            alliance_ids: [101, 102],
            alliance_names: ["A", "B"],
            cities: [10, 20],
            turn: {
                range: [12, 13],
                data: [
                    [
                        [
                            [1, 2],
                            [2, 3],
                        ],
                        [
                            [3, 4],
                            [4, 5],
                        ],
                    ],
                ],
            },
            day: {
                range: [1, 1],
                data: [
                    [
                        [[1, 2]],
                        [[3, 4]],
                    ],
                    [
                        [[15000, 30000]],
                        [[30000, 0]],
                    ],
                    [
                        [[5, 6]],
                        [[7, 8]],
                    ],
                ],
            },
        },
        {
            name: "Blue",
            alliance_ids: [201, 202],
            alliance_names: ["C", "D"],
            cities: [10, 20],
            turn: {
                range: [12, 13],
                data: [
                    [
                        [
                            [2, 3],
                            [3, 4],
                        ],
                        [
                            [1, 1],
                            [2, 2],
                        ],
                    ],
                ],
            },
            day: {
                range: [1, 1],
                data: [
                    [
                        [[2, 1]],
                        [[1, 1]],
                    ],
                    [
                        [[10000, 20000]],
                        [[5000, 5000]],
                    ],
                    [
                        [[2, 3]],
                        [[1, 1]],
                    ],
                ],
            },
        },
    ],
};

describe("bubbleTraceCompute", () => {
    it("builds one coalition point per side per frame in coalition mode", () => {
        const result = generateTraces(
            graphFixture,
            metricX,
            metricY,
            metricSize,
            [0, 70],
            null,
            "coalition",
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.times.is_turn).toBe(true);
        expect(result.times.start).toBe(12);
        expect(result.times.end).toBe(13);

        const frame12Coalition0 = result.traces[12]?.[0];
        const frame12Coalition1 = result.traces[12]?.[1];
        const frame13Coalition0 = result.traces[13]?.[0];
        const frame13Coalition1 = result.traces[13]?.[1];

        expect(frame12Coalition0?.id).toEqual([-1]);
        expect(frame12Coalition1?.id).toEqual([-2]);
        expect(frame12Coalition0?.text).toEqual(["Red"]);
        expect(frame12Coalition1?.text).toEqual(["Blue"]);

        expect(frame12Coalition0?.x?.[0] ?? 0).toBeCloseTo(0.03125);
        expect(frame13Coalition0?.x?.[0] ?? 0).toBeCloseTo(0.03125);
        expect(frame12Coalition0?.y?.[0]).toBe(26);
        expect(frame13Coalition0?.y?.[0]).toBe(26);
        expect(frame12Coalition0?.customdata?.[0]).toBe(10);
        expect(frame13Coalition0?.customdata?.[0]).toBe(24);

        expect(frame12Coalition1?.x?.[0] ?? 0).toBeCloseTo(0.0380952381);
        expect(frame13Coalition1?.x?.[0] ?? 0).toBeCloseTo(0.0380952381);
        expect(frame12Coalition1?.y?.[0]).toBe(7);
        expect(frame13Coalition1?.y?.[0]).toBe(7);
        expect(frame12Coalition1?.customdata?.[0]).toBe(7);
        expect(frame13Coalition1?.customdata?.[0]).toBe(18);
    });

    it("keeps per-alliance output unchanged in alliance mode", () => {
        const result = generateTraces(
            graphFixture,
            metricX,
            metricY,
            metricSize,
            [0, 70],
            null,
            "alliance",
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.traces[12]?.[0]?.id).toEqual([101, 102]);
        expect(result.traces[12]?.[1]?.id).toEqual([201, 202]);
        expect(result.traces[13]?.[0]?.id).toEqual([101, 102]);
        expect(result.traces[13]?.[1]?.id).toEqual([201, 202]);
    });

    it("omits coalitions that have no selected alliances", () => {
        const result = generateTraces(
            graphFixture,
            metricX,
            metricY,
            metricSize,
            [0, 70],
            [101],
            "coalition",
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.traces[12]?.[0]?.id).toEqual([-1]);
        expect(result.traces[12]?.[1]).toBeUndefined();
        expect(result.traces[13]?.[0]?.id).toEqual([-1]);
        expect(result.traces[13]?.[1]).toBeUndefined();
    });

    it("zeros bubble metrics when the selected city span excludes all city buckets", () => {
        const result = generateTraces(
            graphFixture,
            metricX,
            metricY,
            metricSize,
            [25, 30],
            null,
            "coalition",
        );

        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.traces[12]?.[0]?.x?.[0]).toBe(0);
        expect(result.traces[12]?.[0]?.y?.[0]).toBe(0);
        expect(result.traces[12]?.[0]?.customdata?.[0]).toBe(0);
        expect(result.traces[12]?.[1]?.x?.[0]).toBe(0);
        expect(result.traces[12]?.[1]?.y?.[0]).toBe(0);
        expect(result.traces[12]?.[1]?.customdata?.[0]).toBe(0);
    });
});
