import { describe, expect, it } from "vitest";
import { createAavaGridProvider } from "./aavaGrid";
import type { AavaSelectionRow } from "./aavaSelection";
import type { GridQueryState } from "./grid/types";

const ROWS: AavaSelectionRow[] = [
    {
        alliance: ["Rose", 1],
        primary_to_row: 1200,
        row_to_primary: 300,
        net: 900,
        total: 1500,
        primary_share_pct: 75,
        row_share_pct: 25,
        abs_net: 900,
    },
    {
        alliance: ["Aurora", 2],
        primary_to_row: 800,
        row_to_primary: 500,
        net: 300,
        total: 1300,
        primary_share_pct: 25,
        row_share_pct: 75,
        abs_net: 300,
    },
];

function createState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: { key: "net", dir: "desc" },
        filters: {},
        pageIndex: 0,
        pageSize: 10,
        visibleColumnKeys: [
            "name",
            "primary_to_row",
            "net",
            "primary_share_pct",
        ],
        columnOrderKeys: [
            "name",
            "primary_to_row",
            "row_to_primary",
            "net",
            "total",
            "primary_share_pct",
            "row_share_pct",
            "abs_net",
        ],
        expandedRowIds: [],
        selectedRowIds: [],
        ...overrides,
    };
}

describe("aavaGrid provider", () => {
    it("returns formatted link and percent cells plus numeric summaries", async () => {
        const provider = createAavaGridProvider(ROWS, "wars");
        const bootstrap = await provider.bootstrap();
        const result = await provider.query(createState());
        const summary = await provider.querySummary(createState());

        expect(
            bootstrap.columns.find((column) => column.key === "primary_to_row")?.toneClass,
        ).toBe("ux-grid-tone-selected");
        expect(
            bootstrap.columns.find((column) => column.key === "row_to_primary")?.toneClass,
        ).toBe("ux-grid-tone-compared");
        expect(result.filteredRowCount).toBe(2);
        expect(result.rows[0].cells.name).toEqual({
            kind: "link",
            text: "Rose",
            href: "https://politicsandwar.com/alliance/id=1",
            external: true,
        });
        expect(result.rows[0].cells.primary_share_pct).toEqual({
            kind: "number",
            text: "75.00%",
            value: 75,
        });
        expect(summary.net).toEqual({
            sum: 1200,
            avg: 600,
        });
        expect(summary.primary_share_pct).toBeUndefined();
    });

    it("filters by alliance name and exports explicit schema without DOM scraping", async () => {
        const provider = createAavaGridProvider(ROWS, "wars");
        const query = createState({
            filters: { name: "rose" },
            visibleColumnKeys: ["name", "net", "primary_share_pct"],
        });

        const result = await provider.query(query);
        const exported = await provider.exportRows(query);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].id).toBe(1);
        expect(exported.columns).toEqual([
            "alliance",
            "alliance_id",
            "Net",
            "Selected share %",
        ]);
        expect(exported.rows).toEqual([["Rose", 1, 900, 75]]);
    });
});
