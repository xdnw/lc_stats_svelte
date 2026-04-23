import { describe, expect, it } from "vitest";
import {
    encodeGridSelectionFilterValue,
    isGridSelectionFilterValue,
    parseGridSelectionFilterValue,
} from "./filterValue";

describe("grid filter value helpers", () => {
    it("encodes selection filters with sorted unique ids", () => {
        expect(encodeGridSelectionFilterValue([202, "101", 202, " 303 "])).toBe(
            "select:101,202,303",
        );
    });

    it("parses tagged selection filters and ignores plain text", () => {
        expect(parseGridSelectionFilterValue("select:202, 101,202")).toEqual([
            "101",
            "202",
        ]);
        expect(parseGridSelectionFilterValue("alliance")).toBeNull();
        expect(isGridSelectionFilterValue("select:101")).toBe(true);
        expect(isGridSelectionFilterValue("rose")).toBe(false);
    });
});
