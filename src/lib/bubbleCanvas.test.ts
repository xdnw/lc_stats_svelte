import { describe, expect, it } from "vitest";
import {
    buildBubbleCompactLabel,
    buildBubbleCanvasModel,
    clampBubbleFrameIndex,
    findBubbleCanvasHoverPoint,
    type BubbleCanvasPointMeta,
    type BubbleCanvasRenderResult,
} from "./bubbleCanvas";
import { formatDaysToDate } from "./formatting";
import type { TraceBuildResult } from "./graphDerivedCache";
import type { TierMetric } from "./types";

const metrics: [TierMetric, TierMetric, TierMetric] = [
    {
        name: "dealt:loss_value",
        cumulative: true,
        normalize: false,
    },
    {
        name: "loss_value",
        cumulative: false,
        normalize: true,
    },
    {
        name: "off:wars",
        cumulative: true,
        normalize: true,
    },
];

const traceBuildResult: TraceBuildResult = {
    traces: {
        10: {
            0: {
                x: [5, 10],
                y: [20, 40],
                customdata: [25, 100],
                id: [101, 102],
                text: ["Alpha", "Bravo"],
                marker: { size: [] },
            },
            1: {
                x: [15],
                y: [30],
                customdata: [50],
                id: [201],
                text: ["Charlie"],
                marker: { size: [] },
            },
        },
        20: {
            0: {
                x: [7, 14],
                y: [25, 42],
                customdata: [36, 81],
                id: [101, 102],
                text: ["Alpha", "Bravo"],
                marker: { size: [] },
            },
            1: {
                x: [18],
                y: [35],
                customdata: [60],
                id: [201],
                text: ["Charlie"],
                marker: { size: [] },
            },
        },
    },
    times: {
        start: 10,
        end: 20,
        is_turn: false,
    },
    ranges: {
        x: [0, 18],
        y: [0, 42],
        z: [25, 100],
    },
};

describe("bubbleCanvas", () => {
    it("builds a reusable adapter model with stable frame histories", () => {
        const model = buildBubbleCanvasModel({
            traceBuildResult,
            coalitionNames: ["Coalition A", "Coalition B"],
            metrics,
        });

        expect(model).not.toBeNull();
        if (!model) return;

        expect(model.frames).toHaveLength(2);
        expect(model.frames[0]?.label).toBe(formatDaysToDate(10));
        expect(model.frames[1]?.label).toBe(formatDaysToDate(20));
        expect(model.frames[0]?.pointCount).toBe(3);
        expect(model.frames[0]?.maxSizeValue).toBe(100);
        expect(model.frames[1]?.maxSizeValue).toBe(81);
        expect(model.legendItems.map((item) => item.label)).toEqual([
            "Coalition A",
            "Coalition B",
        ]);
        expect(model.xLabel).toBe("dealt:loss_value (sum)");
        expect(model.yLabel).toBe("loss_value (avg)");
        expect(model.sizeLabel).toBe("off:wars (sum) (avg)");
        expect(model.chartConfig.render?.sizeScaleMode).toBe("frame");
        expect(model.xDomain[0]).toBeGreaterThan(0);
        expect(model.yDomain[0]).toBeGreaterThan(0);

        const firstFrameAlpha = model.chartModel.frames[0]?.points.find(
            (point) => point.seriesId === "0:101",
        );
        const secondFrameAlpha = model.chartModel.frames[1]?.points.find(
            (point) => point.seriesId === "0:101",
        );

        expect(firstFrameAlpha?.historyLength).toBe(1);
        expect(secondFrameAlpha?.historyLength).toBe(2);
        expect(
            model.chartModel.seriesById
                .get("0:101")
                ?.points.map(({ x, y, size }) => ({
                    x,
                    y,
                    size,
                })),
        ).toEqual([
            { x: 5, y: 20, size: 25 },
            { x: 7, y: 25, size: 36 },
        ]);
    });

    it("keeps coalitions that first appear after the initial frame", () => {
        const laterCoalitionTraceBuildResult: TraceBuildResult = {
            traces: {
                10: {
                    0: {
                        x: [5],
                        y: [15],
                        customdata: [20],
                        id: [101],
                        text: ["Alpha"],
                        marker: { size: [] },
                    },
                },
                20: {
                    0: {
                        x: [6],
                        y: [18],
                        customdata: [22],
                        id: [101],
                        text: ["Alpha"],
                        marker: { size: [] },
                    },
                    1: {
                        x: [9],
                        y: [21],
                        customdata: [33],
                        id: [201],
                        text: ["Bravo"],
                        marker: { size: [] },
                    },
                },
            },
            times: {
                start: 10,
                end: 20,
                is_turn: false,
            },
            ranges: {
                x: [0, 9],
                y: [0, 21],
                z: [20, 33],
            },
        };

        const model = buildBubbleCanvasModel({
            traceBuildResult: laterCoalitionTraceBuildResult,
            coalitionNames: ["Coalition A", "Coalition B"],
            metrics,
        });

        expect(model).not.toBeNull();
        if (!model) return;

        expect(model.legendItems.map((item) => item.label)).toEqual([
            "Coalition A",
            "Coalition B",
        ]);
        expect(
            model.chartModel.frames[1]?.points.some(
                (point) => point.seriesId === "1:201",
            ),
        ).toBe(true);
        expect(
            model.chartModel.seriesById
                .get("1:201")
                ?.points.map(({ x, y, size }) => ({
                    x,
                    y,
                    size,
                })),
        ).toEqual([{ x: 9, y: 21, size: 33 }]);
    });

    it("clamps active frame indices to the available range", () => {
        expect(clampBubbleFrameIndex(0, 12)).toBe(0);
        expect(clampBubbleFrameIndex(3, -5)).toBe(0);
        expect(clampBubbleFrameIndex(3, 1.6)).toBe(1);
        expect(clampBubbleFrameIndex(3, 9)).toBe(2);
    });

    it("builds compact bubble labels for long multi-word alliance names", () => {
        expect(buildBubbleCompactLabel("Global Alliance & Treaty Organization")).toBe("GATO");
        expect(buildBubbleCompactLabel("The Knights Radiant")).toBe("KR");
        expect(buildBubbleCompactLabel("Rose")).toBe("Rose");
    });

    it("finds the nearest hovered point inside the expanded hit radius", () => {
        const renderResult = {
            points: [
                {
                    seriesId: "0:101",
                    seriesIndex: 0,
                    frameId: 10,
                    frameIndex: 0,
                    frameLabel: "Day 10",
                    label: "Alpha",
                    color: "rgb(255, 0, 0)",
                    xValue: 5,
                    yValue: 20,
                    sizeValue: 25,
                    cssX: 120,
                    cssY: 80,
                    radius: 18,
                    labelText: "Alpha",
                    labelFontSize: 11,
                    meta: {
                        allianceId: 101,
                        coalitionId: 0,
                        coalitionName: "Coalition A",
                        time: 10,
                        timeLabel: "Day 10",
                    } satisfies BubbleCanvasPointMeta,
                },
                {
                    seriesId: "1:201",
                    seriesIndex: 1,
                    frameId: 10,
                    frameIndex: 0,
                    frameLabel: "Day 10",
                    label: "Charlie",
                    color: "rgb(0, 0, 255)",
                    xValue: 15,
                    yValue: 30,
                    sizeValue: 50,
                    cssX: 220,
                    cssY: 110,
                    radius: 12,
                    labelText: "Charlie",
                    labelFontSize: 10,
                    meta: {
                        allianceId: 201,
                        coalitionId: 1,
                        coalitionName: "Coalition B",
                        time: 10,
                        timeLabel: "Day 10",
                    } satisfies BubbleCanvasPointMeta,
                },
            ],
        } as unknown as BubbleCanvasRenderResult;

        expect(findBubbleCanvasHoverPoint(renderResult, 128, 86)?.meta?.allianceId).toBe(101);
        expect(findBubbleCanvasHoverPoint(renderResult, 225, 114)?.meta?.allianceId).toBe(201);
        expect(findBubbleCanvasHoverPoint(renderResult, 30, 30)).toBeNull();
    });
});
