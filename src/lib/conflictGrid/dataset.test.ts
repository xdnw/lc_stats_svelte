import { describe, expect, it } from "vitest";
import { sanitizeConflictCustomColumn } from "../conflictCustomColumns";
import { encodeGridSelectionFilterValue } from "../grid/filterValue";
import type { GridQueryState } from "../grid/types";
import type { MetricCard, RankingCard } from "../kpi";
import type { ConflictGridViewConfig } from "./protocol";
import type { Conflict } from "../types";
import { createConflictGridDataset } from "./dataset";
import { ConflictGridLayout } from "./rowIds";

function createQueryState(overrides?: Partial<GridQueryState>): GridQueryState {
    return {
        sort: null,
        filters: {},
        pageIndex: 0,
        pageSize: 10,
        visibleColumnKeys: ["name", "dealt:damage", "off:wars"],
        columnOrderKeys: [
            "name",
            "dealt:damage",
            "loss:damage",
            "net:damage",
            "off:wars",
            "def:wars",
            "both:wars",
        ],
        expandedRowIds: [],
        selectedRowIds: [],
        ...overrides,
    };
}

function createConflictFixture(): Conflict {
    return {
        name: "Fixture Conflict",
        wiki: "fixture-conflict",
        start: 1000,
        end: 2000,
        cb: "Fixture CB",
        status: "Active",
        posts: {
            Announcement: [123, "fixture-announcement", 1500],
        },
        coalitions: [
            {
                name: "Red Coalition",
                alliance_ids: [101],
                alliance_names: ["Red Alliance"],
                nation_ids: [1001],
                nation_aa: [101],
                nation_names: ["Red Nation"],
                counts: [[], []],
                damage: [
                    [50, 1],
                    [100, 2],
                    [10, 0],
                    [60, 1],
                    [4, 0],
                    [20, 1],
                ] as unknown as [number[], number[]],
            },
            {
                name: "Blue Coalition",
                alliance_ids: [202],
                alliance_names: ["Blue Alliance"],
                nation_ids: [2002],
                nation_aa: [202],
                nation_names: ["Blue Nation"],
                counts: [[], []],
                damage: [
                    [60, 1],
                    [80, 3],
                    [15, 1],
                    [40, 2],
                    [6, 1],
                    [10, 1],
                ] as unknown as [number[], number[]],
            },
        ],
        damage_header: ["loss_value", "wars"],
        header_type: [0, 1],
        war_web: {
            headers: ["wars"],
            data: [
                [
                    [0, 5],
                    [7, 0],
                ],
            ] as unknown as [][][],
        },
    };
}

function createSyntheticConflictFixture(): Conflict {
    return {
        name: "Synthetic Fixture Conflict",
        wiki: "synthetic-fixture-conflict",
        start: 1000,
        end: 2000,
        cb: "Synthetic Fixture CB",
        status: "Active",
        posts: {},
        coalitions: [
            {
                name: "Red Coalition",
                alliance_ids: [101, 102],
                alliance_names: ["Red Alliance", "Gold Alliance"],
                nation_ids: [1001, 1002, 1003],
                nation_aa: [101, 101, 102],
                nation_names: ["Red One", "Red Two", "Gold One"],
                counts: [[], []],
                damage: [
                    [23, 2],
                    [60, 5],
                    [15, 1],
                    [40, 3],
                    [8, 1],
                    [20, 2],
                    [10, 1],
                    [30, 3],
                    [5, 0],
                    [10, 0],
                    [8, 1],
                    [20, 2],
                ] as unknown as [number[], number[]],
            },
            {
                name: "Blue Coalition",
                alliance_ids: [202],
                alliance_names: ["Blue Alliance"],
                nation_ids: [2001, 2002],
                nation_aa: [202, 202],
                nation_names: ["Blue One", "Blue Two"],
                counts: [[], []],
                damage: [
                    [13, 2],
                    [40, 5],
                    [13, 2],
                    [40, 5],
                    [6, 2],
                    [15, 1],
                    [7, 0],
                    [25, 4],
                ] as unknown as [number[], number[]],
            },
        ],
        damage_header: ["loss_value", "wars"],
        header_type: [0, 1],
        war_web: {
            headers: ["wars"],
            data: [
                [
                    [0, 5],
                    [7, 0],
                ],
            ] as unknown as [][][],
        },
    };
}

function createCustomViewConfig(): ConflictGridViewConfig {
    return {
        customColumns: [
            sanitizeConflictCustomColumn({
                kind: "member-rollup",
                label: "Count of nations with off:wars > 1",
                reducer: "count",
                display: "number",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 1 },
                },
            })!,
            sanitizeConflictCustomColumn({
                kind: "member-rollup",
                label: "Share of nations with off:wars > 1",
                reducer: "share",
                display: "percent",
                expr: {
                    kind: "compare",
                    op: "gt",
                    left: { kind: "metric", metric: "off:wars" },
                    right: { kind: "value", value: 1 },
                },
            })!,
        ],
    };
}

function createRowFormulaViewConfig(): ConflictGridViewConfig {
    return {
        customColumns: [
            sanitizeConflictCustomColumn({
                kind: "row-formula",
                label: "Net damage delta",
                formula: {
                    kind: "numeric",
                    display: "money",
                    expr: {
                        kind: "binary",
                        op: "sub",
                        left: { kind: "metric", metric: "dealt:damage" },
                        right: { kind: "metric", metric: "loss:damage" },
                    },
                },
            })!,
            sanitizeConflictCustomColumn({
                kind: "row-formula",
                label: "Off beats def",
                formula: {
                    kind: "flag",
                    display: "flag",
                    expr: {
                        kind: "compare",
                        op: "gt",
                        left: { kind: "metric", metric: "off:wars" },
                        right: { kind: "metric", metric: "def:wars" },
                    },
                },
            })!,
        ],
    };
}

describe("conflictGrid dataset", () => {
    it("builds worker-owned bootstrap metadata and preset KPI metrics", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v1",
            conflictId: "test",
            data: createConflictFixture(),
        });

        const bootstrap = dataset.bootstrap(ConflictGridLayout.COALITION);

        expect(bootstrap.meta.name).toBe("Fixture Conflict");
        expect(bootstrap.meta.coalitions[0]).toEqual({
            name: "Red Coalition",
            alliances: [{ id: 101, name: "Red Alliance" }],
        });
        expect(bootstrap.grid.rowCount).toBe(2);
        expect(bootstrap.grid.columns[0]).toMatchObject({
            key: "name",
            title: "Coalition",
            widthHint: "wide",
        });
        const allianceBootstrap = dataset.bootstrap(ConflictGridLayout.ALLIANCE);
        expect(allianceBootstrap.grid.columns[0]?.filterUi).toMatchObject({
            kind: "selection",
            title: "Filter Alliances",
        });
        expect(
            bootstrap.grid.columns.map((column: { key: string }) => column.key),
        ).toContain("net:damage");
        expect(bootstrap.presetMetrics.totalDamage).toBe(180);
        expect(bootstrap.presetMetrics.warsTracked).toBe(4);
        expect(bootstrap.presetMetrics.damageGap).toBe(50);
        expect(bootstrap.presetMetrics.leadingCoalition?.name).toBe("Red Coalition");
        const coalitionPage = dataset.query(
            ConflictGridLayout.COALITION,
            createQueryState({ visibleColumnKeys: ["name", "dealt:damage"] }),
        );
        expect(coalitionPage.rows[0]?.cells.name).toMatchObject({
            kind: "action",
            text: "Red Coalition",
            actionId: "show-coalition-members",
            args: { coalitionIndex: 0 },
        });
        expect(bootstrap.presetMetrics.offWarsPerNationStats).toEqual({
            totalOffWars: 2,
            totalNations: 2,
            perNation: 1,
        });
    });

    it("answers bounded queries, exports explicit rows, resolves selection snapshots, and computes KPI queries", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v1",
            conflictId: "test",
            data: createConflictFixture(),
        });

        const page = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                sort: { key: "dealt:damage", dir: "desc" },
                filters: { name: "alliance" },
            }),
        );

        expect(page.filteredRowCount).toBe(2);
        expect(page.rows[0]?.id).toBe(101);
        expect(page.rows[0]?.rowClass).toBe("ux-conflict-row-c1");
        expect(page.rows[0]?.cells["dealt:damage"]).toMatchObject({
            kind: "money",
            value: 60,
        });

        const summary = dataset.querySummary(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                sort: { key: "dealt:damage", dir: "desc" },
                filters: { name: "alliance" },
            }),
        );
        expect(summary["dealt:damage"]).toEqual({
            sum: 100,
            avg: 50,
        });

        const exported = dataset.exportRows(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                sort: { key: "dealt:damage", dir: "desc" },
                visibleColumnKeys: ["name", "dealt:damage"],
            }),
        );
        expect(exported.columns).toEqual(["alliance", "alliance_id", "dealt:damage"]);
        expect(exported.rows[0]).toEqual(["Red Alliance", 101, 60]);

        const details = dataset.getRowDetails(
            ConflictGridLayout.NATION,
            1001,
            createQueryState({
                visibleColumnKeys: ["name"],
                columnOrderKeys: [
                    "alliance",
                    "name",
                    "dealt:damage",
                    "loss:damage",
                    "net:damage",
                    "off:wars",
                    "def:wars",
                    "both:wars",
                ],
            }),
        );
        expect(details?.cells.alliance).toBeUndefined();
        expect(details?.cells["dealt:damage"]).toMatchObject({
            kind: "money",
            value: 20,
        });

        const nationExport = dataset.exportRows(
            ConflictGridLayout.NATION,
            createQueryState({
                visibleColumnKeys: ["alliance", "name", "dealt:damage"],
                columnOrderKeys: [
                    "alliance",
                    "name",
                    "dealt:damage",
                    "loss:damage",
                    "net:damage",
                    "off:wars",
                    "def:wars",
                    "both:wars",
                ],
            }),
        );
        expect(nationExport.columns).toEqual([
            "alliance",
            "alliance_id",
            "nation",
            "nation_id",
            "dealt:damage",
        ]);
        expect(nationExport.rows[0]).toEqual([
            "Red Alliance",
            101,
            "Red Nation",
            1001,
            20,
        ]);

        const selection = dataset.getSelectionSnapshot(
            ConflictGridLayout.COALITION,
            [0],
        );
        expect(selection).toEqual({
            allianceIds: [101],
            nationIds: [1001],
            label: "1 alliance · 1 nation",
        });

        const rankingCard: RankingCard = {
            id: "rank-nation-net",
            kind: "ranking",
            entity: "nation",
            metric: "net:damage",
            scope: "all",
            limit: 2,
            source: "conflict",
        };
        const rankingRows = dataset.getRankingRows(rankingCard);
        expect(rankingRows[0]).toMatchObject({
            label: "Red Nation",
            nationId: 1001,
            allianceId: 101,
            value: 16,
        });

        const metricCard: MetricCard = {
            id: "metric-alliance-damage",
            kind: "metric",
            entity: "alliance",
            metric: "dealt:damage",
            scope: "coalition1",
            aggregation: "sum",
            source: "conflict",
        };
        expect(dataset.getMetricCardValue(metricCard)).toBe(60);
    });

    it("builds AAvA alliance links for alliance and nation layouts when route context is available", () => {
        const singleDataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-aava-single",
            conflictId: "test",
            data: createConflictFixture(),
            aavaRouteContext: {
                routeKind: "single",
                basePath: "/base",
            },
        });

        const alliancePage = singleDataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                visibleColumnKeys: ["name", "dealt:damage"],
            }),
        );
        expect(alliancePage.rows[0]?.cells.name).toMatchObject({
            kind: "link",
            text: "Red Alliance",
            href: "/base/aava?id=test&pc=0&c0=101",
        });

        const nationPage = singleDataset.query(
            ConflictGridLayout.NATION,
            createQueryState({
                visibleColumnKeys: ["alliance", "name", "dealt:damage"],
                columnOrderKeys: [
                    "alliance",
                    "name",
                    "dealt:damage",
                    "loss:damage",
                    "net:damage",
                    "off:wars",
                    "def:wars",
                    "both:wars",
                ],
            }),
        );
        expect(nationPage.rows[0]?.cells.alliance).toMatchObject({
            kind: "link",
            text: "Red Alliance",
            href: "/base/aava?id=test&pc=0&c0=101",
        });

        const compositeDataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-aava-composite",
            conflictId: "merged-signature",
            data: createConflictFixture(),
            aavaRouteContext: {
                routeKind: "composite",
                compositeIds: ["11", "22"],
                selectedAllianceId: 9,
                basePath: "/base",
            },
        });

        const compositeAlliancePage = compositeDataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                visibleColumnKeys: ["name", "dealt:damage"],
            }),
        );
        expect(compositeAlliancePage.rows[1]?.cells.name).toMatchObject({
            kind: "link",
            text: "Blue Alliance",
            href: "/base/aava?ids=11%2C22&aid=9&pc=1&c1=202",
        });
    });

    it("defers nation layout construction until the nation layout is actually requested", () => {
        const fixture = createConflictFixture();

        Object.defineProperty(fixture.coalitions[0], "nation_names", {
            configurable: true,
            get() {
                throw new Error("nation rows should stay lazy");
            },
        });

        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-lazy",
            conflictId: "test",
            data: fixture,
        });

        expect(dataset.bootstrap(ConflictGridLayout.COALITION).grid.rowCount).toBe(2);
        expect(() =>
            dataset.query(
                ConflictGridLayout.NATION,
                createQueryState({
                    visibleColumnKeys: ["alliance", "name", "dealt:damage"],
                    columnOrderKeys: [
                        "alliance",
                        "name",
                        "dealt:damage",
                        "loss:damage",
                        "net:damage",
                        "off:wars",
                        "def:wars",
                        "both:wars",
                    ],
                }),
            )).toThrow("nation rows should stay lazy");
    });

    it("sorts nation names by nation instead of alliance and can prewarm numeric caches", () => {
        const fixture = createConflictFixture();
        fixture.coalitions[0].alliance_names = ["Zulu Alliance"];
        fixture.coalitions[0].nation_names = ["Bravo Nation"];
        fixture.coalitions[1].alliance_names = ["Alpha Alliance"];
        fixture.coalitions[1].nation_names = ["Zulu Nation"];

        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v2",
            conflictId: "test",
            data: fixture,
        });

        const page = dataset.query(
            ConflictGridLayout.NATION,
            createQueryState({
                sort: { key: "name", dir: "asc" },
                pageSize: "all",
                viewport: { start: 0, end: 80 },
                visibleColumnKeys: ["alliance", "name", "dealt:damage"],
                columnOrderKeys: [
                    "alliance",
                    "name",
                    "dealt:damage",
                    "loss:damage",
                    "net:damage",
                    "off:wars",
                    "def:wars",
                    "both:wars",
                ],
            }),
        );

        expect(page.rows[0]?.cells.name).toMatchObject({
            kind: "link",
            text: "Bravo Nation",
        });

        const warmed = dataset.prewarm([
            ConflictGridLayout.ALLIANCE,
            ConflictGridLayout.NATION,
        ], true);

        expect(warmed.warmedLayouts).toEqual([
            ConflictGridLayout.ALLIANCE,
            ConflictGridLayout.NATION,
        ]);
        expect(warmed.metricVectorsWarmed).toBeGreaterThan(0);
    });

    it("keeps all-rows queries bounded to the viewport window", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v3",
            conflictId: "test",
            data: createConflictFixture(),
        });

        const page = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                pageSize: "all",
                viewport: { start: 1, end: 2 },
                visibleColumnKeys: ["name", "dealt:damage"],
            }),
        );

        expect(page.filteredRowCount).toBe(2);
        expect(page.rows).toHaveLength(1);
        expect(page.rows[0]?.id).toBe(202);
    });

    it("filters alliance-valued columns with tagged multi-select ids", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-selection",
            conflictId: "test",
            data: createConflictFixture(),
        });

        const alliancePage = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                filters: { name: encodeGridSelectionFilterValue([202]) },
            }),
        );
        expect(alliancePage.filteredRowCount).toBe(1);
        expect(alliancePage.rows[0]?.id).toBe(202);

        const nationPage = dataset.query(
            ConflictGridLayout.NATION,
            createQueryState({
                filters: {
                    alliance: encodeGridSelectionFilterValue([101]),
                },
                visibleColumnKeys: ["alliance", "name", "dealt:damage"],
                columnOrderKeys: [
                    "alliance",
                    "name",
                    "dealt:damage",
                    "loss:damage",
                    "net:damage",
                    "off:wars",
                    "def:wars",
                    "both:wars",
                ],
            }),
        );
        expect(nationPage.filteredRowCount).toBe(1);
        expect(nationPage.rows[0]?.id).toBe(1001);
    });

    it("reuses query and summary results for equivalent filter matches", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v4",
            conflictId: "test",
            data: createConflictFixture(),
        });

        const firstQuery = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({ filters: { name: "all" } }),
        );
        const secondQuery = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({ filters: { name: "alli" } }),
        );

        expect(secondQuery).toBe(firstQuery);

        const firstSummary = dataset.querySummary(
            ConflictGridLayout.ALLIANCE,
            createQueryState({ filters: { name: "all" } }),
        );
        const secondSummary = dataset.querySummary(
            ConflictGridLayout.ALLIANCE,
            createQueryState({ filters: { name: "alli" } }),
        );

        expect(secondSummary).toBe(firstSummary);
    });

    it("adds custom member rollups to coalition and alliance bootstraps but not nation bootstraps", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-synth-bootstrap",
            conflictId: "test",
            data: createSyntheticConflictFixture(),
        });
        const viewConfig = createCustomViewConfig();

        const coalitionBootstrap = dataset.bootstrap(
            ConflictGridLayout.COALITION,
            viewConfig,
        );
        const allianceBootstrap = dataset.bootstrap(
            ConflictGridLayout.ALLIANCE,
            viewConfig,
        );
        const nationBootstrap = dataset.bootstrap(
            ConflictGridLayout.NATION,
            viewConfig,
        );

        const countColumnId = viewConfig.customColumns[0]?.id;
        const shareColumnId = viewConfig.customColumns[1]?.id;

        expect(countColumnId).toBeTruthy();
        expect(shareColumnId).toBeTruthy();
        expect(coalitionBootstrap.grid.columns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: countColumnId,
                    title: "Count of nations with off:wars > 1",
                    summary: null,
                    metricEligible: false,
                }),
                expect.objectContaining({
                    key: shareColumnId,
                    title: "Share of nations with off:wars > 1",
                    summary: null,
                    metricEligible: false,
                }),
            ]),
        );
        expect(allianceBootstrap.grid.columns.map((column) => column.key)).toEqual(
            expect.arrayContaining([countColumnId!, shareColumnId!]),
        );
        expect(nationBootstrap.grid.columns.map((column) => column.key)).not.toEqual(
            expect.arrayContaining([countColumnId!, shareColumnId!]),
        );
    });

    it("computes coalition and alliance custom count/share values for sort, summary, export, and row details", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-synth-values",
            conflictId: "test",
            data: createSyntheticConflictFixture(),
        });
        const viewConfig = createCustomViewConfig();
        const countColumnId = viewConfig.customColumns[0]!.id;
        const shareColumnId = viewConfig.customColumns[1]!.id;

        const coalitionPage = dataset.query(
            ConflictGridLayout.COALITION,
            createQueryState({
                pageSize: "all",
                visibleColumnKeys: ["name", countColumnId, shareColumnId],
                columnOrderKeys: [
                    "name",
                    countColumnId,
                    shareColumnId,
                    "dealt:damage",
                    "off:wars",
                ],
            }),
            viewConfig,
        );

        expect(coalitionPage.rows[0]?.cells[countColumnId]).toMatchObject({
            kind: "number",
            value: 2,
        });
        expect((coalitionPage.rows[0]?.cells[shareColumnId] as { value: number }).value).toBeCloseTo(
            66.6666666667,
        );
        expect(coalitionPage.rows[1]?.cells[countColumnId]).toMatchObject({
            kind: "number",
            value: 1,
        });
        expect((coalitionPage.rows[1]?.cells[shareColumnId] as { value: number }).value).toBe(50);

        const coalitionSummary = dataset.querySummary(
            ConflictGridLayout.COALITION,
            createQueryState({
                visibleColumnKeys: ["name", countColumnId, shareColumnId],
                columnOrderKeys: ["name", countColumnId, shareColumnId],
            }),
            viewConfig,
        );
        expect(coalitionSummary[countColumnId]).toBeUndefined();
        expect(coalitionSummary[shareColumnId]).toBeUndefined();

        const alliancePage = dataset.query(
            ConflictGridLayout.ALLIANCE,
            createQueryState({
                sort: { key: shareColumnId, dir: "desc" },
                pageSize: "all",
                visibleColumnKeys: ["name", countColumnId, shareColumnId],
                columnOrderKeys: ["name", countColumnId, shareColumnId],
            }),
            viewConfig,
        );
        expect(alliancePage.rows.map((row) => row.id)).toEqual([102, 101, 202]);
        expect((alliancePage.rows[0]?.cells[shareColumnId] as { value: number }).value).toBe(100);
        expect((alliancePage.rows[1]?.cells[countColumnId] as { value: number }).value).toBe(1);

        const exported = dataset.exportRows(
            ConflictGridLayout.COALITION,
            createQueryState({
                visibleColumnKeys: ["name", countColumnId, shareColumnId],
                columnOrderKeys: ["name", countColumnId, shareColumnId],
            }),
            viewConfig,
        );
        expect(exported.columns).toEqual([
            "coalition",
            "coalition_index",
            "Count of nations with off:wars > 1",
            "Share of nations with off:wars > 1",
        ]);
        expect(exported.rows[0]?.[2]).toBe(2);
        expect(Number(exported.rows[0]?.[3])).toBeCloseTo(66.6666666667);

        const details = dataset.getRowDetails(
            ConflictGridLayout.COALITION,
            0,
            createQueryState({
                visibleColumnKeys: ["name"],
                columnOrderKeys: ["name", countColumnId, shareColumnId],
            }),
            viewConfig,
        );
        expect((details?.cells[countColumnId] as { value: number }).value).toBe(2);
        expect((details?.cells[shareColumnId] as { value: number }).value).toBeCloseTo(
            66.6666666667,
        );
    });

    it("computes != custom member comparisons against both value and metric rhs", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-synth-neq",
            conflictId: "test",
            data: createSyntheticConflictFixture(),
        });
        const countNotEqualValue = sanitizeConflictCustomColumn({
            kind: "member-rollup",
            label: "Count of nations with both:wars != 0",
            reducer: "count",
            display: "number",
            expr: {
                kind: "compare",
                op: "neq",
                left: { kind: "metric", metric: "both:wars" },
                right: { kind: "value", value: 0 },
            },
        })!;
        const shareNotEqualMetric = sanitizeConflictCustomColumn({
            kind: "member-rollup",
            label: "Share of nations with off:wars != def:wars",
            reducer: "share",
            display: "percent",
            expr: {
                kind: "compare",
                op: "neq",
                left: { kind: "metric", metric: "off:wars" },
                right: { kind: "metric", metric: "def:wars" },
            },
        })!;
        const viewConfig = {
            customColumns: [countNotEqualValue, shareNotEqualMetric],
        };

        const coalitionPage = dataset.query(
            ConflictGridLayout.COALITION,
            createQueryState({
                pageSize: "all",
                visibleColumnKeys: ["name", countNotEqualValue.id, shareNotEqualMetric.id],
                columnOrderKeys: ["name", countNotEqualValue.id, shareNotEqualMetric.id],
            }),
            viewConfig,
        );

        expect((coalitionPage.rows[0]?.cells[countNotEqualValue.id] as { value: number }).value).toBe(2);
        expect((coalitionPage.rows[1]?.cells[countNotEqualValue.id] as { value: number }).value).toBe(2);
        expect((coalitionPage.rows[0]?.cells[shareNotEqualMetric.id] as { value: number }).value).toBeCloseTo(66.6666666667);
        expect((coalitionPage.rows[1]?.cells[shareNotEqualMetric.id] as { value: number }).value).toBe(100);
    });

    it("computes row formulas on nation layout and renders flags as Yes or No while sorting numerically", () => {
        const dataset = createConflictGridDataset({
            datasetKey: "conflict-grid:test:v-row-formula",
            conflictId: "test",
            data: createConflictFixture(),
        });
        const viewConfig = createRowFormulaViewConfig();
        const numericColumnId = viewConfig.customColumns[0]!.id;
        const flagColumnId = viewConfig.customColumns[1]!.id;

        const nationBootstrap = dataset.bootstrap(
            ConflictGridLayout.NATION,
            viewConfig,
        );
        expect(nationBootstrap.grid.columns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: numericColumnId,
                    title: "Net damage delta",
                    summary: "sum-avg",
                    metricEligible: false,
                }),
                expect.objectContaining({
                    key: flagColumnId,
                    title: "Off beats def",
                    summary: null,
                    metricEligible: false,
                }),
            ]),
        );

        const nationPage = dataset.query(
            ConflictGridLayout.NATION,
            createQueryState({
                sort: { key: flagColumnId, dir: "desc" },
                pageSize: "all",
                visibleColumnKeys: ["name", numericColumnId, flagColumnId],
                columnOrderKeys: ["name", numericColumnId, flagColumnId],
            }),
            viewConfig,
        );

        expect(nationPage.rows.map((row) => row.id)).toEqual([1001, 2002]);
        expect(nationPage.rows[0]?.cells[numericColumnId]).toMatchObject({
            kind: "money",
            value: 16,
        });
        expect(nationPage.rows[0]?.cells[flagColumnId]).toMatchObject({
            kind: "text",
            text: "Yes",
        });
        expect(nationPage.rows[1]?.cells[flagColumnId]).toMatchObject({
            kind: "text",
            text: "No",
        });

        const nationSummary = dataset.querySummary(
            ConflictGridLayout.NATION,
            createQueryState({
                visibleColumnKeys: ["name", numericColumnId, flagColumnId],
                columnOrderKeys: ["name", numericColumnId, flagColumnId],
            }),
            viewConfig,
        );
        expect(nationSummary[numericColumnId]).toEqual({
            sum: 20,
            avg: 10,
        });
        expect(nationSummary[flagColumnId]).toBeUndefined();
    });
});
