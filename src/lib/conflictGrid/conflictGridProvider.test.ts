import { describe, expect, it, vi } from "vitest";
import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { ScopeSnapshot } from "../kpi";
import { createConflictGridProvider } from "./conflictGridProvider";
import { ConflictGridLayout } from "./rowIds";
import type { ConflictGridWorkerClient } from "./workerClient";

function createQueryState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: null,
        filters: {},
        pageIndex: 0,
        pageSize: "all",
        visibleColumnKeys: ["name", "dealt:damage"],
        columnOrderKeys: ["name", "dealt:damage", "loss:damage"],
        expandedRowIds: [],
        selectedRowIds: [],
        viewport: { start: 100, end: 196 },
        ...overrides,
    };
}

function createPageResult(label: string, filteredRowCount = 1000): GridPageResult {
    return {
        totalRowCount: filteredRowCount,
        filteredRowCount,
        allFilteredRowsSelected: false,
        rows: [
            {
                id: label,
                cells: {
                    name: {
                        kind: "text",
                        text: label,
                    },
                },
            },
        ],
        summaryByColumnKey: {},
    };
}

function createWorkerClient(
    query: ConflictGridWorkerClient["query"],
): ConflictGridWorkerClient {
    return {
        conflictId: "fixture-conflict",
        datasetRef: {
            datasetKey: "conflict-grid:fixture-conflict:v1",
            conflictId: "fixture-conflict",
            url: "https://example.invalid/conflict.gzip",
            version: "1",
        },
        bootstrap: async (layout) => ({
            datasetKey: "conflict-grid:fixture-conflict:v1",
            layout,
            meta: {
                conflictId: "fixture-conflict",
                name: "Fixture Conflict",
                wiki: "fixture-conflict",
                start: 0,
                end: 0,
                cb: "",
                status: "Active",
                posts: {},
                updateMs: null,
                coalitions: [],
            },
            grid: {
                columns: [
                    {
                        key: "name",
                        title: "Name",
                        sortable: "text",
                        filterable: true,
                    },
                    {
                        key: "dealt:damage",
                        title: "Damage",
                        sortable: "number",
                        filterable: false,
                        summary: "sum-avg",
                    },
                ],
                rowCount: 1000,
            },
            presetMetrics: {
                coalitionSummary: null,
                totalDamage: null,
                warsTracked: null,
                damageGap: null,
                leadingCoalition: null,
                offWarsPerNationStats: null,
            },
        }),
        query,
        querySummary: async () => ({} satisfies GridSummaryByColumnKey),
        getRowDetails: async () => null as GridPageRow | null,
        getFilteredRowIds: async () => [] as GridRowId[],
        exportRows: async () => ({ columns: [], rows: [] } satisfies GridExportResult),
        prewarmLayouts: async () => ({
            datasetKey: "conflict-grid:fixture-conflict:v1",
            warmedLayouts: [],
            metricVectorsWarmed: 0,
            elapsedMs: 0,
        }),
        getSelectionSnapshot: async () => ({
            allianceIds: [],
            nationIds: [],
            label: "0 alliances",
        } satisfies ScopeSnapshot),
        getRankingRows: async () => [],
        getMetricCardValue: async () => null,
        destroy: () => undefined,
    };
}

describe("conflictGridProvider", () => {
    it("normalizes all-mode viewport bounds before querying the worker client", async () => {
        const query = vi.fn(async (_layout, _state) => createPageResult("normalized"));
        const provider = createConflictGridProvider({
            client: createWorkerClient(query),
            layout: ConflictGridLayout.ALLIANCE,
        });
        const state = createQueryState({
            viewport: { start: -12.5, end: 196.9 },
        });

        await provider.bootstrap();
        const result = await provider.query(state);

        expect(result.rows[0]?.id).toBe("normalized");
        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(
            ConflictGridLayout.ALLIANCE,
            expect.objectContaining({
                viewport: { start: 0, end: 196 },
            }),
        );
        expect(state.viewport).toEqual({ start: -12.5, end: 196.9 });
    });

    it("drops invalid all-mode viewports instead of sending empty windows", async () => {
        const query = vi.fn(async (_layout, _state) => createPageResult("invalid"));
        const provider = createConflictGridProvider({
            client: createWorkerClient(query),
            layout: ConflictGridLayout.NATION,
        });
        const state = createQueryState({
            viewport: { start: 120, end: 40 },
        });

        await provider.bootstrap();
        await provider.query(state);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(
            ConflictGridLayout.NATION,
            expect.objectContaining({
                viewport: undefined,
            }),
        );
    });

    it("keeps bootstrap overrides without mutating the worker bootstrap payload", async () => {
        const query = vi.fn(async (_layout, _state) => createPageResult("paged"));
        const provider = createConflictGridProvider({
            client: createWorkerClient(query),
            layout: ConflictGridLayout.COALITION,
            defaultSort: { key: "dealt:damage", dir: "desc" },
            defaultVisibleColumnKeys: ["dealt:damage"],
        });

        const bootstrap = await provider.bootstrap();

        expect(bootstrap.defaultSort).toEqual({ key: "dealt:damage", dir: "desc" });
        expect(bootstrap.defaultVisibleColumnKeys).toEqual(["dealt:damage"]);
        expect(bootstrap.columns.map((column) => column.key)).toEqual([
            "name",
            "dealt:damage",
        ]);
    });
});
