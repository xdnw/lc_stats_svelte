import { describe, expect, it } from "vitest";
import { createConflictsIndexGridProvider, type ConflictsIndexRow } from "./conflictsIndexGrid";
import type { GridQueryState } from "./grid/types";

const ROWS: ConflictsIndexRow[] = [
    {
        id: 42,
        name: "Example Conflict",
        c1Name: "Coalition One",
        c2Name: "Coalition Two",
        start: 1000,
        end: -1,
        category: "Global",
        wars: 12,
        activeWars: 4,
        c1Dealt: 1000000,
        c2Dealt: 750000,
        total: 1750000,
        pinned: [],
        c1Alliances: [],
        c2Alliances: [],
        wikiUrl: "https://example.invalid/wiki/example-conflict",
        status: "Active",
        cb: "Example CB",
        posts: [],
        rowClass: "ux-conflicts-row-active",
    },
];

function createState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: { key: "name", dir: "asc" },
        filters: {},
        pageIndex: 0,
        pageSize: 10,
        visibleColumnKeys: ["name", "c1_name", "c2_name"],
        columnOrderKeys: [
            "name",
            "c1_name",
            "c2_name",
            "start",
            "end",
            "category",
            "wars",
            "active_wars",
            "c1_dealt",
            "c2_dealt",
            "total",
            "status",
            "cb",
            "posts",
        ],
        expandedRowIds: [],
        selectedRowIds: [],
        ...overrides,
    };
}

describe("conflictsIndexGrid provider", () => {
    it("keeps the conflict name as a compact modal action", async () => {
        const provider = createConflictsIndexGridProvider({
            rows: ROWS,
            showPinnedColumn: false,
        });

        const result = await provider.query(createState());
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].cells.name).toEqual({
            kind: "action",
            text: "Example Conflict",
            actionId: "open-conflict-card",
            args: { conflictId: 42 },
            title: "Open conflict actions for Example Conflict",
            href: "/conflict?id=42",
        });
        expect(result.rows[0].cells.c1_name).toEqual({
            kind: "action",
            text: "Coalition One",
            actionId: "open-coalition",
            args: { conflictId: 42, coalitionIndex: 0 },
            title: "Show coalition 1 for Example Conflict",
        });

        const wikiResult = await provider.query(
            createState({
                visibleColumnKeys: ["wiki"],
            }),
        );
        expect(wikiResult.rows[0].cells.wiki).toEqual({
            kind: "link",
            text: "Wiki",
            href: "https://example.invalid/wiki/example-conflict",
            external: true,
        });

        const fieldResult = await provider.query(
            createState({
                visibleColumnKeys: ["status", "cb"],
            }),
        );
        expect(fieldResult.rows[0].cells.status).toEqual({
            kind: "action",
            text: "Status",
            actionId: "open-field",
            args: { conflictId: 42, field: "status" },
            title: "Active",
        });
        expect(fieldResult.rows[0].cells.cb).toEqual({
            kind: "action",
            text: "CB",
            actionId: "open-field",
            args: { conflictId: 42, field: "cb" },
            title: "Example CB",
        });
    });

    it("preserves row styling and exports explicit structured rows", async () => {
        const provider = createConflictsIndexGridProvider({
            rows: ROWS,
            showPinnedColumn: false,
        });

        const bootstrap = await provider.bootstrap();

        const query = createState({
            visibleColumnKeys: ["name", "total", "status"],
        });
        const result = await provider.query(query);
        const summary = await provider.querySummary(query);
        const exported = await provider.exportRows(query);

        expect(bootstrap.columns.find((column) => column.key === "status")?.widthHint).toBe("text");
        expect(bootstrap.columns.find((column) => column.key === "cb")?.widthHint).toBe("text");
        expect(bootstrap.columns.find((column) => column.key === "wiki")?.widthHint).toBe("text");
        expect(bootstrap.columns.find((column) => column.key === "pinned")?.widthHint).toBe("text");
        expect(result.rows[0]?.rowClass).toBe("ux-conflicts-row-active");
        expect(summary.total).toEqual({
            sum: 1750000,
            avg: 1750000,
        });
        expect(exported.columns).toEqual([
            "conflict",
            "conflict_id",
            "Total",
            "Status",
        ]);
        expect(exported.rows[0]).toEqual([
            "Example Conflict",
            42,
            1750000,
            "Active",
        ]);
    });
});
