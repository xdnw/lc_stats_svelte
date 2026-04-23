import { describe, expect, it } from "vitest";
import { buildBubbleCanvasModel } from "./bubbleCanvas";
import type { TraceBuildResult } from "./graphDerivedCache";
import type { TierMetric } from "./types";

const metrics: [TierMetric, TierMetric, TierMetric] = [
    { name: "dealt:loss_value", cumulative: true, normalize: false },
    { name: "loss:loss_value", cumulative: true, normalize: false },
    { name: "off:wars", cumulative: true, normalize: false },
];

describe("bubbleCanvas coalition adapter", () => {
    it("keeps one coalition series per side with stable history", () => {
        const traceBuildResult: TraceBuildResult = {
            traces: {
                12: {
                    0: {
                        x: [10],
                        y: [20],
                        customdata: [30],
                        id: [-1],
                        text: ["Red"],
                        marker: { size: [] },
                    },
                    1: {
                        x: [15],
                        y: [25],
                        customdata: [35],
                        id: [-2],
                        text: ["Blue"],
                        marker: { size: [] },
                    },
                },
                13: {
                    0: {
                        x: [11],
                        y: [21],
                        customdata: [31],
                        id: [-1],
                        text: ["Red"],
                        marker: { size: [] },
                    },
                    1: {
                        x: [16],
                        y: [26],
                        customdata: [36],
                        id: [-2],
                        text: ["Blue"],
                        marker: { size: [] },
                    },
                },
            },
            times: {
                start: 12,
                end: 13,
                is_turn: true,
            },
            ranges: {
                x: [0, 16],
                y: [0, 26],
                z: [30, 36],
            },
        };

        const model = buildBubbleCanvasModel({
            traceBuildResult,
            coalitionNames: ["Red", "Blue"],
            metrics,
        });

        expect(model).not.toBeNull();
        if (!model) return;

        expect(model.frames).toHaveLength(2);
        expect(model.frames[0]?.pointCount).toBe(2);
        expect(model.frames[1]?.pointCount).toBe(2);
        expect(model.chartModel.seriesById.has("0:-1")).toBe(true);
        expect(model.chartModel.seriesById.has("1:-2")).toBe(true);

        const redFirstFrame = model.chartModel.frames[0]?.points.find(
            (point) => point.seriesId === "0:-1",
        );
        const redSecondFrame = model.chartModel.frames[1]?.points.find(
            (point) => point.seriesId === "0:-1",
        );
        expect(redFirstFrame?.historyLength).toBe(1);
        expect(redSecondFrame?.historyLength).toBe(2);

        expect(model.legendItems.map((item) => item.label)).toEqual([
            "Red",
            "Blue",
        ]);
    });
});
