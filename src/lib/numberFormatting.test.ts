import { describe, expect, it } from "vitest";
import { formatCompactNumberValue } from "./numberFormatting";

describe("formatCompactNumberValue", () => {
    it("keeps small values readable without a suffix", () => {
        expect(formatCompactNumberValue(0)).toBe("0");
        expect(formatCompactNumberValue(12.34)).toBe("12.3");
        expect(formatCompactNumberValue(999)).toBe("999");
    });

    it("uses compact suffixes for larger values", () => {
        expect(formatCompactNumberValue(1_500)).toBe("1.5K");
        expect(formatCompactNumberValue(2_450_000)).toBe("2.45M");
        expect(formatCompactNumberValue(-3_200_000_000)).toBe("-3.2B");
    });
});