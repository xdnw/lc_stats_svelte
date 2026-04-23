import { describe, expect, it } from "vitest";
import {
    findTieringCanvasHoverBar,
    type TieringCanvasRenderResult,
} from "./tieringCanvas";

describe("tieringCanvas", () => {
    it("finds a hovered bar segment inside the bar bounds", () => {
        const renderResult: TieringCanvasRenderResult = {
            bars: [
                {
                    labelIndex: 0,
                    label: "10-14",
                    stack: "0",
                    stackIndex: 0,
                    datasetLabel: "Coalition A",
                    segmentValue: 120,
                    stackTotal: 180,
                    color: "rgb(255, 0, 0)",
                    canvasX: 100,
                    canvasY: 64,
                    left: 88,
                    top: 64,
                    width: 24,
                    height: 96,
                },
                {
                    labelIndex: 0,
                    label: "10-14",
                    stack: "0",
                    stackIndex: 0,
                    datasetLabel: "Coalition B",
                    segmentValue: 60,
                    stackTotal: 180,
                    color: "rgb(0, 0, 255)",
                    canvasX: 100,
                    canvasY: 28,
                    left: 88,
                    top: 28,
                    width: 24,
                    height: 36,
                },
            ],
        };

        expect(findTieringCanvasHoverBar(renderResult, 96, 80)?.datasetLabel).toBe(
            "Coalition A",
        );
        expect(findTieringCanvasHoverBar(renderResult, 104, 40)?.datasetLabel).toBe(
            "Coalition B",
        );
        expect(findTieringCanvasHoverBar(renderResult, 10, 10)).toBeNull();
    });

    it("uses the expanded hit slop around narrow bar segments", () => {
        const renderResult: TieringCanvasRenderResult = {
            bars: [
                {
                    labelIndex: 2,
                    label: 12,
                    stack: "1",
                    stackIndex: 1,
                    datasetLabel: "Ships",
                    segmentValue: 8,
                    stackTotal: 48,
                    color: "rgb(12, 99, 220)",
                    canvasX: 214,
                    canvasY: 142,
                    left: 208,
                    top: 142,
                    width: 12,
                    height: 8,
                },
            ],
        };

        expect(findTieringCanvasHoverBar(renderResult, 205, 145)?.datasetLabel).toBe(
            "Ships",
        );
        expect(findTieringCanvasHoverBar(renderResult, 226, 145)).toBeNull();
    });
});