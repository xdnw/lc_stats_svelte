import { describe, expect, it } from "vitest";
import {
    buildSliderContextSignature,
    normalizeGraphSliderScalar,
    normalizeGraphSliderValues,
    resolveDraggedThumbIndex,
    sliderValuesEqual,
} from "./graphSlider";

describe("normalizeGraphSliderScalar", () => {
    it("snaps scalar values to the discrete slider step", () => {
        expect(
            normalizeGraphSliderScalar(6.7, {
                min: 0,
                max: 10,
                step: 2,
                mode: "single",
            }),
        ).toBe(6);
    });
});

describe("normalizeGraphSliderValues", () => {
    it("clamps and snaps single-value sliders", () => {
        expect(
            normalizeGraphSliderValues([6.7], {
                min: 0,
                max: 10,
                step: 2,
                mode: "single",
            }),
        ).toEqual([6]);
        expect(
            normalizeGraphSliderValues([-10], {
                min: 0,
                max: 10,
                step: 1,
                mode: "single",
            }),
        ).toEqual([0]);
    });

    it("clamps range sliders and preserves ordered handles", () => {
        expect(
            normalizeGraphSliderValues([9.3, 3.1], {
                min: 0,
                max: 10,
                step: 1,
                mode: "range",
            }),
        ).toEqual([9, 9]);
        expect(
            normalizeGraphSliderValues([], {
                min: 0,
                max: 10,
                step: 1,
                mode: "range",
            }),
        ).toEqual([0, 0]);
    });
});

describe("sliderValuesEqual", () => {
    it("compares slider arrays by value", () => {
        expect(sliderValuesEqual([1, 2], [1, 2])).toBe(true);
        expect(sliderValuesEqual([1, 2], [1, 3])).toBe(false);
    });
});

describe("buildSliderContextSignature", () => {
    it("captures mode and bounds changes", () => {
        expect(
            buildSliderContextSignature(
                { min: 0, max: 10, step: 1, mode: "single" },
                "a",
            ),
        ).not.toEqual(
            buildSliderContextSignature(
                { min: 0, max: 10, step: 1, mode: "range" },
                "a",
            ),
        );
    });
});

describe("resolveDraggedThumbIndex", () => {
    it("switches to the start thumb when overlapped handles are dragged left", () => {
        expect(resolveDraggedThumbIndex("range", 1, [40, 40], 32)).toBe(0);
    });

    it("keeps the end thumb active when overlapped handles are dragged right", () => {
        expect(resolveDraggedThumbIndex("range", 1, [40, 40], 48)).toBe(1);
    });

    it("keeps the chosen thumb when handles are already separated", () => {
        expect(resolveDraggedThumbIndex("range", 1, [24, 40], 32)).toBe(1);
        expect(resolveDraggedThumbIndex("range", 0, [24, 40], 18)).toBe(0);
    });
});
