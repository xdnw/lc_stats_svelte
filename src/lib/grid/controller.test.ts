import { describe, expect, it } from "vitest";
import {
    clearGridSelection,
    hideAllGridColumns,
    initializeGridController,
    moveGridColumn,
    setGridFilter,
    setGridPageIndex,
    setGridPageSize,
    setGridViewport,
    showAllGridColumns,
    toggleGridColumnVisibility,
    toggleGridRowSelection,
    toggleGridSort,
} from "./controller";
import type { GridBootstrapResult } from "./types";

const BOOTSTRAP: GridBootstrapResult = {
    columns: [
        {
            key: "name",
            title: "Name",
            sortable: "text",
            filterable: true,
            summary: null,
            alwaysVisible: true,
        },
        {
            key: "damage",
            title: "Damage",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
        },
        {
            key: "wars",
            title: "Wars",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
        },
        {
            key: "share",
            title: "Share",
            sortable: "number",
            filterable: false,
            summary: null,
        },
    ],
    defaultSort: { key: "damage", dir: "desc" },
    defaultVisibleColumnKeys: ["name", "damage", "wars"],
    rowCount: 4,
};

describe("grid controller", () => {
    it("initializes from bootstrap defaults", () => {
        const state = initializeGridController(BOOTSTRAP, null);

        expect(state.sort).toEqual({ key: "damage", dir: "desc" });
        expect(state.visibleColumnKeys).toEqual(["name", "damage", "wars"]);
        expect(state.columnOrderKeys).toEqual(["name", "damage", "wars", "share"]);
        expect(state.pageSize).toBe(10);
    });

    it("toggles sort with numeric desc and text asc defaults", () => {
        let state = initializeGridController(BOOTSTRAP, null);

        state = toggleGridSort(BOOTSTRAP, state, "wars");
        expect(state.sort).toEqual({ key: "wars", dir: "desc" });

        state = toggleGridSort(BOOTSTRAP, state, "wars");
        expect(state.sort).toEqual({ key: "wars", dir: "asc" });

        state = toggleGridSort(BOOTSTRAP, state, "name");
        expect(state.sort).toEqual({ key: "name", dir: "asc" });
    });

    it("resets paging when filters or page size change", () => {
        let state = initializeGridController(BOOTSTRAP, {
            pageIndex: 3,
            pageSize: 25,
        });

        state = setGridFilter(BOOTSTRAP, state, "name", "Rose");
        expect(state.pageIndex).toBe(0);
        expect(state.filters).toEqual({ name: "Rose" });

        state = setGridPageIndex(BOOTSTRAP, state, 2);
        state = setGridPageSize(BOOTSTRAP, state, "all");
        expect(state.pageIndex).toBe(0);
        expect(state.pageSize).toBe("all");
        expect(state.viewport).toEqual({ start: 0, end: 0 });
    });

    it("keeps always-visible columns while hiding and reordering others", () => {
        let state = initializeGridController(BOOTSTRAP, null);

        state = toggleGridColumnVisibility(BOOTSTRAP, state, "wars");
        expect(state.visibleColumnKeys).toEqual(["name", "damage"]);

        state = hideAllGridColumns(BOOTSTRAP, state);
        expect(state.visibleColumnKeys).toEqual(["name"]);

        state = showAllGridColumns(BOOTSTRAP, state);
        expect(state.visibleColumnKeys).toEqual(["name", "damage", "wars", "share"]);

        state = moveGridColumn(BOOTSTRAP, state, "wars", -1);
        expect(state.columnOrderKeys).toEqual(["name", "wars", "damage", "share"]);
    });

    it("supports row-id selection and shift ranges", () => {
        let state = initializeGridController(BOOTSTRAP, null);
        const filteredRowIds = [101, 102, 103, 104];

        state = toggleGridRowSelection(BOOTSTRAP, state, filteredRowIds, 102, false);
        expect(state.selectedRowIds).toEqual([102]);

        state = toggleGridRowSelection(BOOTSTRAP, state, filteredRowIds, 104, true);
        expect(state.selectedRowIds).toEqual([102, 103, 104]);

        state = clearGridSelection(BOOTSTRAP, state);
        expect(state.selectedRowIds).toEqual([]);
        expect(state.selectionAnchorRowId).toBeNull();
    });

    it("treats equivalent filter and paging updates as no-ops", () => {
        const filteredState = initializeGridController(BOOTSTRAP, {
            filters: { name: "Rose" },
            pageIndex: 2,
        });

        expect(setGridFilter(BOOTSTRAP, filteredState, "name", "  Rose  ")).toBe(
            filteredState,
        );
        expect(setGridPageIndex(BOOTSTRAP, filteredState, 2)).toBe(filteredState);

        const allRowsState = initializeGridController(BOOTSTRAP, {
            pageSize: "all",
            viewport: { start: 24, end: 48 },
        });

        expect(setGridPageSize(BOOTSTRAP, allRowsState, "all")).toBe(allRowsState);
        expect(
            setGridViewport(BOOTSTRAP, allRowsState, { start: 24, end: 48 }),
        ).toBe(allRowsState);
    });
});
