import { describe, expect, it } from "vitest";
import { normalizeTieringSliderValues } from "./tieringSelection";

describe("normalizeTieringSliderValues", () => {
    const timeRange: [number, number] = [100, 140];

    it("defaults range selections to the full available span", () => {
        expect(normalizeTieringSliderValues([], timeRange, true)).toEqual([
            100,
            140,
        ]);
    });

    it("expands single-point selections into start-anchored cumulative ranges", () => {
        expect(normalizeTieringSliderValues([132], timeRange, true)).toEqual([
            100,
            132,
        ]);
    });

    it("preserves explicit ranges while clamping to the available span", () => {
        expect(
            normalizeTieringSliderValues([109.7, 999], timeRange, true),
        ).toEqual([110, 140]);
    });

    it("collapses range selections back to the selected endpoint in point mode", () => {
        expect(normalizeTieringSliderValues([100, 132], timeRange, false)).toEqual([
            132,
        ]);
    });
});
