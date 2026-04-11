import { describe, expect, it } from "vitest";
import { createInMemoryGridProvider } from "./inMemoryProvider";
import type { GridQueryState } from "../types";

type Row = {
    id: number;
    name: string;
    score: number;
};

const ROWS: Row[] = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    name: `Row ${index + 1}`,
    score: 1000 - index,
}));

function createState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: { key: "score", dir: "desc" },
        filters: {},
        pageIndex: 0,
        pageSize: 10,
        visibleColumnKeys: ["name", "score"],
        columnOrderKeys: ["name", "score"],
        expandedRowIds: [],
        selectedRowIds: [],
        ...overrides,
    };
}

describe("inMemory grid provider", () => {
    it("keeps all-rows mode bounded to the requested viewport", async () => {
        const provider = createInMemoryGridProvider({
            rows: ROWS,
            getRowId: (row) => row.id,
            columns: [
                {
                    key: "name",
                    title: "Name",
                    sortable: "text",
                    filterable: true,
                    summary: null,
                    getCell: (row) => ({ kind: "text", text: row.name }),
                },
                {
                    key: "score",
                    title: "Score",
                    sortable: "number",
                    filterable: false,
                    summary: "sum-avg",
                    getCell: (row) => ({ kind: "number", text: String(row.score), value: row.score }),
                },
            ],
            defaultSort: { key: "score", dir: "desc" },
        });

        const result = await provider.query(
            createState({
                pageSize: "all",
                viewport: { start: 20, end: 36 },
            }),
        );

        expect(result.filteredRowCount).toBe(120);
        expect(result.rows).toHaveLength(16);
        expect(result.rows[0]?.id).toBe(21);
        expect(result.rows.at(-1)?.id).toBe(36);
    });
});
