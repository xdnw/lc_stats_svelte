import { describe, expect, it } from "vitest";
import {
    buildMetricTimeCanvasModel,
    findMetricTimeHoverDatum,
    formatMetricTimeMetricLabel,
    type MetricTimeCanvasRenderResult,
} from "./metricTimeCanvas";
import type { MetricTimeSeriesResult } from "./metricTimeCompute";

const seriesResult: MetricTimeSeriesResult = {
    metric: {
        name: "off:wars",
        cumulative: true,
        normalize: false,
    },
    isTurn: false,
    timeRange: [1, 3],
    yDomain: [5, 15],
    series: [
        {
            key: "alliance:0:101",
            label: "Alpha",
            color: "rgb(255, 0, 0)",
            coalitionIndex: 0,
            allianceId: 101,
            start: 1,
            end: 3,
            values: [5, 10, 15],
        },
        {
            key: "alliance:1:201",
            label: "Bravo",
            color: "rgb(0, 0, 255)",
            coalitionIndex: 1,
            allianceId: 201,
            start: 1,
            end: 3,
            values: [Number.NaN, 8, 12],
        },
    ],
};

describe("metricTimeCanvas", () => {
    it("builds a reusable canvas model from the derived series artifact", () => {
        const model = buildMetricTimeCanvasModel(seriesResult);

        expect(model).not.toBeNull();
        if (!model) return;

        expect(model).toBe(seriesResult);
        expect(formatMetricTimeMetricLabel(model.metric)).toBe("off:wars (sum)");
        expect(model.timeRange).toEqual([1, 3]);
        expect(model.yDomain).toEqual([5, 15]);
        expect(model.series[0]?.values).toEqual([5, 10, 15]);
    });

    it("finds the nearest visible point at the hovered time index", () => {
        const model = buildMetricTimeCanvasModel(seriesResult);
        const renderResult: MetricTimeCanvasRenderResult = {
            cssWidth: 400,
            cssHeight: 240,
            plotArea: {
                left: 40,
                top: 20,
                right: 360,
                bottom: 200,
            },
            xScale: {
                domain: [1, 3],
                range: [40, 360],
                scale: (value) => 40 + ((value - 1) / 2) * 320,
                invert: (value) => 1 + ((value - 40) / 320) * 2,
            },
            yScale: {
                domain: [0, 20],
                range: [200, 20],
                scale: (value) => 200 - (value / 20) * 180,
                invert: (value) => ((200 - value) / 180) * 20,
            },
            model,
        };

        expect(findMetricTimeHoverDatum(renderResult, 200, 112)?.seriesKey).toBe(
            "alliance:0:101",
        );
        expect(findMetricTimeHoverDatum(renderResult, 200, 128)?.seriesKey).toBe(
            "alliance:1:201",
        );
    });

    it("ignores NaN values during hover lookup", () => {
        const model = buildMetricTimeCanvasModel(seriesResult);
        const renderResult: MetricTimeCanvasRenderResult = {
            cssWidth: 400,
            cssHeight: 240,
            plotArea: {
                left: 40,
                top: 20,
                right: 360,
                bottom: 200,
            },
            xScale: {
                domain: [1, 3],
                range: [40, 360],
                scale: (value) => 40 + ((value - 1) / 2) * 320,
                invert: (value) => 1 + ((value - 40) / 320) * 2,
            },
            yScale: {
                domain: [0, 20],
                range: [200, 20],
                scale: (value) => 200 - (value / 20) * 180,
                invert: (value) => ((200 - value) / 180) * 20,
            },
            model,
        };

        expect(findMetricTimeHoverDatum(renderResult, 40, 150)?.seriesKey).toBe(
            "alliance:0:101",
        );
    });

    it("returns null for empty models or far-away pointers", () => {
        const model = buildMetricTimeCanvasModel(seriesResult);
        const renderResult: MetricTimeCanvasRenderResult = {
            cssWidth: 400,
            cssHeight: 240,
            plotArea: {
                left: 40,
                top: 20,
                right: 360,
                bottom: 200,
            },
            xScale: {
                domain: [1, 3],
                range: [40, 360],
                scale: (value) => 40 + ((value - 1) / 2) * 320,
                invert: (value) => 1 + ((value - 40) / 320) * 2,
            },
            yScale: {
                domain: [0, 20],
                range: [200, 20],
                scale: (value) => 200 - (value / 20) * 180,
                invert: (value) => ((200 - value) / 180) * 20,
            },
            model,
        };

        expect(findMetricTimeHoverDatum(null, 0, 0)).toBeNull();
        expect(findMetricTimeHoverDatum(renderResult, 10, 10)).toBeNull();
        expect(findMetricTimeHoverDatum(renderResult, 200, 20)).toBeNull();
    });
});
