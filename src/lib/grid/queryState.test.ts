import { describe, expect, it } from "vitest";
import type { GridQueryState } from "./types";
import {
    createGridQueryStateOverride,
    parseGridPageSizeQueryState,
    parseGridQueryState,
    serializeGridPageSizeQueryState,
    serializeGridQueryState,
} from "./queryState";

const DEFAULTS: Partial<GridQueryState> = {
    sort: { key: "end", dir: "desc" },
    filters: {},
    pageSize: 10,
    visibleColumnKeys: ["name", "start", "end"],
    columnOrderKeys: ["name", "start", "end", "status"],
};

function createState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: { key: "end", dir: "desc" },
        filters: {},
        pageIndex: 0,
        pageSize: 10,
        visibleColumnKeys: ["name", "start", "end"],
        columnOrderKeys: ["name", "start", "end", "status"],
        expandedRowIds: [],
        selectedRowIds: [],
        ...overrides,
    };
}

describe("grid query state", () => {
    it("drops default and transient controller fields", () => {
        const state = createState({
            pageIndex: 4,
            expandedRowIds: [101],
            selectedRowIds: [202],
        });

        expect(createGridQueryStateOverride(state, DEFAULTS)).toBeNull();
        expect(serializeGridQueryState(state, DEFAULTS)).toBeNull();
    });

    it("round-trips non-default sort, filters, page size, and column state", () => {
        const state = createState({
            sort: { key: "wars", dir: "asc" },
            filters: {
                category: "  GREAT ",
                name: "Epic",
                ignored: "   ",
            },
            pageSize: "all",
            visibleColumnKeys: ["name", "total", "name"],
            columnOrderKeys: ["total", "name", "status", "name"],
            selectedRowIds: [42],
        });

        const serialized = serializeGridQueryState(state, DEFAULTS);

        expect(serialized).not.toBeNull();
        expect(parseGridQueryState(serialized)).toEqual({
            sort: { key: "wars", dir: "asc" },
            filters: {
                category: "GREAT",
                name: "Epic",
            },
            pageSize: "all",
            visibleColumnKeys: ["name", "total"],
            columnOrderKeys: ["total", "name", "status"],
        });
    });

    it("ignores invalid payloads", () => {
        expect(parseGridQueryState("{")).toBeNull();
        expect(
            parseGridQueryState(
                JSON.stringify({
                    sort: { key: "", dir: "sideways" },
                    filters: { category: "   " },
                    pageSize: 15,
                    visibleColumnKeys: [],
                    columnOrderKeys: [1, 2, 3],
                }),
            ),
        ).toBeNull();
    });

    it("round-trips page-size-only route persistence", () => {
        expect(serializeGridPageSizeQueryState(10)).toBeNull();

        const serialized = serializeGridPageSizeQueryState("all");

        expect(serialized).toBe(JSON.stringify({ pageSize: "all" }));
        expect(parseGridPageSizeQueryState(serialized)).toBe("all");
        expect(
            parseGridPageSizeQueryState(
                JSON.stringify({
                    sort: { key: "wars", dir: "asc" },
                    pageSize: 25,
                }),
            ),
        ).toBe(25);
    });
});
