import { describe, expect, it } from "vitest";
import {
    areGridCellViewsEqual,
    areGridPageResultsEqual,
    areGridSummaryByColumnKeyEqual,
} from "./renderState";
import type { GridPageResult, GridSummaryByColumnKey } from "./types";

function createResult(overrides?: Partial<GridPageResult>): GridPageResult {
    return {
        totalRowCount: 4,
        filteredRowCount: 2,
        allFilteredRowsSelected: false,
        rows: [
            {
                id: 101,
                rowClass: "active",
                cells: {
                    name: { kind: "text", text: "Rose" },
                    damage: { kind: "number", text: "123", value: 123 },
                    meta: {
                        kind: "stack",
                        items: [
                            { kind: "link", text: "Wiki", href: "/wiki" },
                            {
                                kind: "action",
                                text: "Open",
                                actionId: "open",
                                args: { id: 101 },
                            },
                        ],
                    },
                },
            },
        ],
        summaryByColumnKey: {},
        ...overrides,
    };
}

describe("grid render state", () => {
    it("treats equal page results as reusable", () => {
        const left = createResult();
        const right = createResult({
            rows: [
                {
                    id: 101,
                    rowClass: "active",
                    cells: {
                        name: { kind: "text", text: "Rose" },
                        damage: { kind: "number", text: "123", value: 123 },
                        meta: {
                            kind: "stack",
                            items: [
                                { kind: "link", text: "Wiki", href: "/wiki" },
                                {
                                    kind: "action",
                                    text: "Open",
                                    actionId: "open",
                                    args: { id: 101 },
                                },
                            ],
                        },
                    },
                },
            ],
        });

        expect(areGridPageResultsEqual(left, right)).toBe(true);
    });

    it("detects meaningful row content changes", () => {
        const left = createResult();
        const right = createResult({
            rows: [
                {
                    id: 101,
                    rowClass: "active",
                    cells: {
                        name: { kind: "text", text: "Rose" },
                        damage: { kind: "number", text: "124", value: 124 },
                        meta: {
                            kind: "stack",
                            items: [
                                { kind: "link", text: "Wiki", href: "/wiki" },
                                {
                                    kind: "action",
                                    text: "Open",
                                    actionId: "open",
                                    args: { id: 101 },
                                },
                            ],
                        },
                    },
                },
            ],
        });

        expect(areGridPageResultsEqual(left, right)).toBe(false);
    });

    it("compares summaries and cell views structurally", () => {
        const leftSummary: GridSummaryByColumnKey = {
            damage: { sum: 100, avg: 50 },
        };
        const rightSummary: GridSummaryByColumnKey = {
            damage: { sum: 100, avg: 50 },
        };

        expect(areGridSummaryByColumnKeyEqual(leftSummary, rightSummary)).toBe(
            true,
        );
        expect(
            areGridCellViewsEqual(
                {
                    kind: "action",
                    text: "Open",
                    actionId: "open",
                    args: { id: 101, enabled: true },
                    href: "/conflict?id=101",
                },
                {
                    kind: "action",
                    text: "Open",
                    actionId: "open",
                    args: { enabled: true, id: 101 },
                    href: "/conflict?id=101",
                },
            ),
        ).toBe(true);
    });
});
