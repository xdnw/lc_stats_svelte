import { describe, expect, it } from "vitest";
import { normalizeBubbleCityRange } from "./bubbleSelection";

describe("normalizeBubbleCityRange", () => {
    it("clamps bubble city ranges to the supported bounds", () => {
        expect(normalizeBubbleCityRange([-5, 99])).toEqual([0, 70]);
    });

    it("keeps range handles ordered", () => {
        expect(normalizeBubbleCityRange([33, 12])).toEqual([33, 33]);
    });
});
