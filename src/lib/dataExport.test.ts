import { describe, expect, it } from "vitest";
import { normalizeCompositeColumnsForLegacyExport } from "./dataExport";

describe("dataExport", () => {
    it("splits nation composite cells into explicit export columns", () => {
        expect(
            normalizeCompositeColumnsForLegacyExport([
                ["name", "net:damage"],
                [["Rose", 123456, 1234], 98765],
            ]),
        ).toEqual([
            ["nation", "nation_id", "alliance_id", "net:damage"],
            ["Rose", 123456, 1234, 98765],
        ]);
    });

    it("splits alliance composite cells into explicit export columns", () => {
        expect(
            normalizeCompositeColumnsForLegacyExport([
                ["alliance", "net"],
                [["The Knights", 789], 12],
            ]),
        ).toEqual([
            ["alliance", "alliance_id", "net"],
            ["The Knights", 789, 12],
        ]);
    });

    it("leaves non-composite exports unchanged", () => {
        expect(
            normalizeCompositeColumnsForLegacyExport([
                ["key", "value"],
                ["wars", 42],
            ]),
        ).toEqual([
            ["key", "value"],
            ["wars", 42],
        ]);
    });
});