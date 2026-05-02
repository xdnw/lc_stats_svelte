import { describe, expect, it } from "vitest";
import { applyRangeToggle } from "./rangeToggle";

describe("applyRangeToggle", () => {
    it("toggles a single target without shift", () => {
        const result = applyRangeToggle([1, 2, 3], new Set<number>(), null, 2, false);

        expect(Array.from(result.selected)).toEqual([2]);
        expect(result.anchor).toBe(2);
    });

    it("adds a range when shift-clicking an unselected target", () => {
        const result = applyRangeToggle(
            [101, 102, 103, 104],
            new Set<number>([102]),
            102,
            104,
            true,
        );

        expect(Array.from(result.selected)).toEqual([102, 103, 104]);
        expect(result.anchor).toBe(104);
    });

    it("removes a range when shift-clicking a selected target", () => {
        const result = applyRangeToggle(
            [101, 102, 103, 104],
            new Set<number>([101, 102, 103, 104]),
            104,
            102,
            true,
        );

        expect(Array.from(result.selected)).toEqual([101]);
        expect(result.anchor).toBe(102);
    });

    it("falls back to single toggle when anchor is not in the ordered list", () => {
        const result = applyRangeToggle(
            [1, 2, 3],
            new Set<number>([2]),
            999,
            2,
            true,
        );

        expect(Array.from(result.selected)).toEqual([]);
        expect(result.anchor).toBe(2);
    });
});
