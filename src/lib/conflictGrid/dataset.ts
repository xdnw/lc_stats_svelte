import { buildAavaSelectionRows } from "../aavaSelection";
import {
    getOrderedColumns,
    getVisibleColumns,
    normalizeGridControllerState,
    toGridQueryState,
} from "../grid/state";
import { resolveGridRowWindow } from "../grid/virtualization";
import type {
    GridBootstrapResult,
    GridCellView,
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { MetricCard, RankingCard, ScopeSnapshot, WidgetScope } from "../kpi";
import { buildSelectionSnapshot } from "../kpiSnapshot";
import { formatAllianceName, formatNationName } from "../formatting";
import { buildTabHref } from "../conflictTabs";
import { createConflictCustomColumnComputer } from "../conflictCustomColumnCompute";
import { filterConflictCustomColumnsForLayout } from "../conflictCustomColumns";
import { encodeGridSelectionFilterValue, parseGridSelectionFilterValue } from "../grid/filterValue";
import { formatMoneyValue, formatNumberValue } from "../numberFormatting";
import { buildCoalitionAllianceItems } from "../selectionModalHelpers";
import type { Conflict } from "../types";
import {
    buildConflictCustomGridColumnSpecs,
    buildConflictGridColumnSpecs,
    isConflictMetricColumnSpec,
    isConflictNumericColumnSpec,
    type ConflictGridAllianceColumnSpec,
    type ConflictGridColumnSpec,
    type ConflictGridCustomColumnSpec,
    type ConflictGridMetricColumnSpec,
    type ConflictGridNameColumnSpec,
    type ConflictGridNumericColumnSpec,
} from "./conflictGridColumns";
import {
    getConflictGridViewHash,
    normalizeConflictGridViewConfig,
} from "./protocol";
import type {
    ConflictGridBootstrapPayload,
    ConflictGridMeta,
    ConflictGridPrewarmResult,
    ConflictGridPresetMetrics,
    ConflictKpiRankingRow,
    ConflictGridViewConfig,
} from "./protocol";
import {
    ALL_CONFLICT_GRID_LAYOUTS,
    ConflictGridLayout,
    allianceRowId,
    coalitionRowId,
    nationRowId,
    type ConflictGridLayoutValue,
} from "./rowIds";

type SortValue = string | number | null;

type ConflictRowMeta = {
    id: GridRowId;
    index: number;
    layout: ConflictGridLayoutValue;
    coalitionIndex: 0 | 1;
    rowClass: string | null;
    allianceIds: number[];
    nationIds: number[];
    allianceId: number | null;
    allianceName: string | null;
    nationId: number | null;
    nationName: string | null;
    nameCell: GridCellView;
    allianceCell: GridCellView;
    nameFilterText: string;
    nameSortText: string;
    allianceFilterText: string;
    allianceSortText: string;
    exportNameCells: unknown[];
    exportAllianceCells: unknown[];
    damageTaken: number[];
    damageDealt: number[];
};

type ConflictLayoutDataset = {
    layout: ConflictGridLayoutValue;
    bootstrap: GridBootstrapResult;
    rows: ConflictRowMeta[];
    rowMetaById: Map<GridRowId, ConflictRowMeta>;
};

type ResolvedConflictGridView = {
    config: ConflictGridViewConfig;
    hash: string;
    customColumns: ConflictGridViewConfig["customColumns"];
};

type ConflictCustomMembershipIndexes = {
    nationRowIndexesByCoalitionIndex: number[][];
    nationRowIndexesByAllianceIndex: number[][];
    nationCountByCoalitionIndex: Float64Array;
    nationCountByAllianceIndex: Float64Array;
};

type ConflictGridAavaRouteContext =
    | {
          routeKind: "single";
          basePath?: string;
      }
    | {
          routeKind: "composite";
          compositeIds: string[];
          selectedAllianceId: number;
          basePath?: string;
      };

const ROW_CLASS_BY_COALITION: Record<0 | 1, string> = {
    0: "ux-conflict-row-c1",
    1: "ux-conflict-row-c2",
};

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function roundElapsedMs(startedAt: number): number {
    return Math.round((nowMs() - startedAt) * 100) / 100;
}

function normalizeText(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeFilterCacheValue(value: string): string {
    const selectedIds = parseGridSelectionFilterValue(value);
    if (selectedIds == null) {
        return normalizeText(value);
    }
    return encodeGridSelectionFilterValue(selectedIds);
}

function numericValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildInternalBootstrap(
    columns: GridBootstrapResult["columns"],
    rowCount: number,
): GridBootstrapResult {
    return {
        columns,
        defaultSort: null,
        defaultVisibleColumnKeys: columns.map((column) => column.key),
        rowCount,
    };
}

function compareSortValues(
    left: SortValue,
    right: SortValue,
    dir: "asc" | "desc",
): number {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;

    let base = 0;
    if (typeof left === "number" && typeof right === "number") {
        base = left - right;
    } else {
        base = String(left).localeCompare(String(right));
    }

    return dir === "asc" ? base : -base;
}

function formatKpiMetricValueText(
    column: ConflictGridMetricColumnSpec,
    value: number,
): string {
    const formatted = Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
    return column.valueKind === "money" ? `$${formatted}` : formatted;
}

function formatAavaMetricValueText(value: number): string {
    if (!Number.isFinite(value)) return "0";
    return value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
}

function uniqueNumericIds(values: Array<number | null | undefined>): number[] {
    const seen = new Set<number>();
    const next: number[] = [];
    values.forEach((value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || seen.has(parsed)) return;
        seen.add(parsed);
        next.push(parsed);
    });
    return next;
}

function buildConflictGridAavaHref(options: {
    conflictId: string;
    coalitionIndex: 0 | 1;
    allianceId: number;
    routeContext?: ConflictGridAavaRouteContext;
}): string | null {
    const { allianceId, coalitionIndex, conflictId, routeContext } = options;
    if (!routeContext) return null;

    const baseHref =
        routeContext.routeKind === "composite"
            ? buildTabHref("aava", {
                  routeKind: "composite",
                  compositeIds: routeContext.compositeIds,
                  selectedAllianceId: routeContext.selectedAllianceId,
                  basePath: routeContext.basePath,
              })
            : buildTabHref("aava", {
                  routeKind: "single",
                  conflictId,
                  basePath: routeContext.basePath,
              });

    if (!baseHref) return null;

    const [pathname, rawSearch = ""] = baseHref.split("?");
    const query = new URLSearchParams(rawSearch);
    query.delete("pc");
    query.delete("c0");
    query.delete("c1");
    query.delete("pids");
    query.delete("vids");
    query.set("pc", String(coalitionIndex));
    query.set(coalitionIndex === 0 ? "c0" : "c1", String(allianceId));
    const serialized = query.toString();
    return serialized ? `${pathname}?${serialized}` : pathname;
}

function buildAllianceLinkCell(options: {
    text: string;
    allianceId: number;
    coalitionIndex: 0 | 1;
    conflictId: string;
    routeContext?: ConflictGridAavaRouteContext;
}): GridCellView {
    const href = buildConflictGridAavaHref({
        conflictId: options.conflictId,
        coalitionIndex: options.coalitionIndex,
        allianceId: options.allianceId,
        routeContext: options.routeContext,
    });

    if (href) {
        return {
            kind: "link",
            text: options.text,
            href,
        };
    }

    return {
        kind: "link",
        text: options.text,
        href: `https://politicsandwar.com/alliance/id=${options.allianceId}`,
        external: true,
    };
}

export function createConflictGridDataset(options: {
    datasetKey: string;
    conflictId: string;
    data: Conflict;
    aavaRouteContext?: ConflictGridAavaRouteContext;
}) {
    const datasetCreateStartedAt = nowMs();
    const { aavaRouteContext, data, conflictId, datasetKey } = options;
    const baseColumnSpecs = buildConflictGridColumnSpecs(data);
    const baseColumnSpecByKey = new Map<string, ConflictGridColumnSpec>(
        baseColumnSpecs.map((column) => [column.key, column]),
    );
    const nameColumn = baseColumnSpecByKey.get("name") as ConflictGridNameColumnSpec;
    const allianceColumn = baseColumnSpecByKey.get("alliance") as ConflictGridAllianceColumnSpec;
    const metricColumnByKey = new Map<string, ConflictGridMetricColumnSpec>(
        baseColumnSpecs
            .filter(isConflictMetricColumnSpec)
            .map((column) => [column.key, column]),
    );
    const namesByAllianceId: Record<number, string> = {};
    const allianceFilterItems = buildCoalitionAllianceItems(
        data.coalitions,
        formatAllianceName,
    );
    const allianceSelectionFilterUi = allianceFilterItems.length > 0
        ? {
              kind: "selection" as const,
              title: "Filter Alliances",
              description:
                  "Select one or more alliances to include for this column filter.",
              searchPlaceholder: "Search alliances",
              selectedCountLabel: "Alliances selected",
              applyLabel: "Apply filter",
              items: allianceFilterItems,
          }
        : null;
    const filteredRowsCache = new Map<string, ConflictRowMeta[]>();
    const filteredRowIdsCache = new Map<string, GridRowId[]>();
    const filteredRowSequenceKeyCache = new Map<string, string>();
    const pageResultCache = new Map<string, GridPageResult>();
    const summaryCache = new Map<string, GridSummaryByColumnKey>();
    const metricVectorCache = new Map<string, Float64Array>();
    const bootstrapCache = new Map<string, GridBootstrapResult>();
    const customColumnSpecCache = new Map<string, ConflictGridCustomColumnSpec[]>();
    const customColumnSpecByKeyCache = new Map<
        string,
        Map<string, ConflictGridCustomColumnSpec>
    >();
    const customComputerCache = new Map<
        string,
        ReturnType<typeof createConflictCustomColumnComputer>
    >();
    const rankingCache = new Map<string, ConflictKpiRankingRow[]>();
    const metricCardCache = new Map<string, number | null>();
    let customMembershipIndexes: ConflictCustomMembershipIndexes | null = null;

    data.coalitions.forEach((coalition) => {
        coalition.alliance_ids.forEach((allianceId, index) => {
            namesByAllianceId[allianceId] = formatAllianceName(
                coalition.alliance_names[index],
                allianceId,
            );
        });
    });

    function toBootstrapColumn(
        column: ConflictGridColumnSpec,
        overrides?: Partial<GridBootstrapResult["columns"][number]>,
    ): GridBootstrapResult["columns"][number] {
        return {
            key: column.key,
            title: column.title,
            toneClass: column.toneClass,
            widthHint: column.widthHint,
            sortable: column.sortable,
            filterable: column.filterable,
            summary: column.summary ?? null,
            detailsEligible: column.detailsEligible,
            exportLabel: column.exportLabel,
            alwaysVisible: column.alwaysVisible,
            metricEligible: column.metricEligible,
            ...overrides,
        };
    }

    function resolveView(
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ): ResolvedConflictGridView {
        const normalized = normalizeConflictGridViewConfig(viewConfig);
        const customColumns = filterConflictCustomColumnsForLayout(
            layout,
            normalized.customColumns,
        );
        const config =
            customColumns === normalized.customColumns
                ? normalized
                : { customColumns };
        return {
            config,
            hash: getConflictGridViewHash(config),
            customColumns,
        };
    }

    function buildViewCacheKey(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
    ): string {
        return `${layout}::${view.hash}`;
    }

    function getCustomColumnSpecs(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
    ): ConflictGridCustomColumnSpec[] {
        if (view.customColumns.length === 0) {
            return [];
        }

        const cacheKey = buildViewCacheKey(layout, view);
        const cached = customColumnSpecCache.get(cacheKey);
        if (cached) return cached;

        const next = buildConflictCustomGridColumnSpecs(view.customColumns);
        customColumnSpecCache.set(cacheKey, next);
        customColumnSpecByKeyCache.set(
            cacheKey,
            new Map(next.map((column) => [column.key, column])),
        );
        return next;
    }

    function getCustomColumnSpec(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
        columnKey: string,
    ): ConflictGridCustomColumnSpec | null {
        const cacheKey = buildViewCacheKey(layout, view);
        if (!customColumnSpecByKeyCache.has(cacheKey)) {
            void getCustomColumnSpecs(layout, view);
        }
        return customColumnSpecByKeyCache.get(cacheKey)?.get(columnKey) ?? null;
    }

    function getColumnSpec(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
        columnKey: string,
    ): ConflictGridColumnSpec | null {
        return (
            baseColumnSpecByKey.get(columnKey) ??
            getCustomColumnSpec(layout, view, columnKey) ??
            null
        );
    }

    function getNumericColumnSpec(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
        columnKey: string,
    ): ConflictGridNumericColumnSpec | null {
        const column = getColumnSpec(layout, view, columnKey);
        return column && isConflictNumericColumnSpec(column) ? column : null;
    }

    function buildLayoutColumns(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
    ): GridBootstrapResult["columns"] {
        const metricColumns = baseColumnSpecs
            .filter(isConflictMetricColumnSpec)
            .map((column) => toBootstrapColumn(column));
        const customColumns = getCustomColumnSpecs(layout, view).map((column) =>
            toBootstrapColumn(column)
        );

        if (layout === ConflictGridLayout.COALITION) {
            return [
                toBootstrapColumn(nameColumn, {
                    title: "Coalition",
                    alwaysVisible: true,
                }),
                ...metricColumns,
                ...customColumns,
            ];
        }

        if (layout === ConflictGridLayout.ALLIANCE) {
            return [
                toBootstrapColumn(nameColumn, {
                    title: "Alliance",
                    alwaysVisible: true,
                    filterUi: allianceSelectionFilterUi,
                }),
                ...metricColumns,
                ...customColumns,
            ];
        }

        return [
            toBootstrapColumn(allianceColumn, {
                title: "Alliance",
                alwaysVisible: true,
                filterUi: allianceSelectionFilterUi,
            }),
            toBootstrapColumn(nameColumn, {
                title: "Nation",
                alwaysVisible: true,
            }),
            ...metricColumns,
            ...customColumns,
        ];
    }

    function buildMetricCell(
        row: ConflictRowMeta,
        column: ConflictGridMetricColumnSpec,
    ): GridCellView {
        const value = getMetricValue(row, column);
        if (column.valueKind === "money") {
            return {
                kind: "money",
                text: formatMoneyValue(value),
                value,
            };
        }
        return {
            kind: "number",
            text: formatNumberValue(value),
            value,
        };
    }

    function getMetricValue(
        row: ConflictRowMeta,
        column: ConflictGridMetricColumnSpec,
    ): number {
        return getMetricVector(row.layout, column)[row.index] ?? 0;
    }

    function computeMetricValue(
        row: ConflictRowMeta,
        column: ConflictGridMetricColumnSpec,
    ): number {
        return computeMetricValueFromArrays(
            row.damageTaken,
            row.damageDealt,
            column,
        );
    }

    function computeMetricValueFromArrays(
        damageTaken: number[] | null | undefined,
        damageDealt: number[] | null | undefined,
        column: ConflictGridMetricColumnSpec,
    ): number {
        const taken = numericValue(damageTaken?.[column.headerIndex]);
        const dealt = numericValue(damageDealt?.[column.headerIndex]);

        switch (column.metricKind) {
            case "loss":
            case "def":
                return taken;
            case "dealt":
            case "off":
                return dealt;
            case "net":
                return dealt - taken;
            case "both":
                return dealt + taken;
        }
    }

    function getMetricVector(
        layout: ConflictGridLayoutValue,
        column: ConflictGridMetricColumnSpec,
    ): Float64Array {
        const cacheKey = `${layout}:${column.key}`;
        const cached = metricVectorCache.get(cacheKey);
        if (cached) return cached;

        const rows = getLayoutDataset(layout).rows;
        const vector = new Float64Array(rows.length);
        rows.forEach((row) => {
            vector[row.index] = computeMetricValue(row, column);
        });
        metricVectorCache.set(cacheKey, vector);
        return vector;
    }

    function buildCustomMembershipIndexes(): ConflictCustomMembershipIndexes {
        const coalitionRows = getLayoutDataset(ConflictGridLayout.COALITION).rows;
        const allianceRows = getLayoutDataset(ConflictGridLayout.ALLIANCE).rows;
        const nationRows = getLayoutDataset(ConflictGridLayout.NATION).rows;
        const coalitionMembers = coalitionRows.map(() => [] as number[]);
        const allianceMembers = allianceRows.map(() => [] as number[]);
        const allianceRowIndexByParent = new Map<string, number>();

        allianceRows.forEach((row) => {
            if (row.allianceId == null) return;
            allianceRowIndexByParent.set(
                `${row.coalitionIndex}:${row.allianceId}`,
                row.index,
            );
        });

        nationRows.forEach((row) => {
            coalitionMembers[row.coalitionIndex]?.push(row.index);
            if (row.allianceId == null) return;
            const allianceRowIndex = allianceRowIndexByParent.get(
                `${row.coalitionIndex}:${row.allianceId}`,
            );
            if (allianceRowIndex == null) return;
            allianceMembers[allianceRowIndex]?.push(row.index);
        });

        return {
            nationRowIndexesByCoalitionIndex: coalitionMembers,
            nationRowIndexesByAllianceIndex: allianceMembers,
            nationCountByCoalitionIndex: Float64Array.from(
                coalitionMembers.map((members) => members.length),
            ),
            nationCountByAllianceIndex: Float64Array.from(
                allianceMembers.map((members) => members.length),
            ),
        };
    }

    function getCustomMembershipIndexes(): ConflictCustomMembershipIndexes {
        if (customMembershipIndexes) {
            return customMembershipIndexes;
        }
        customMembershipIndexes = buildCustomMembershipIndexes();
        return customMembershipIndexes;
    }

    function getCustomComputer(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
    ): ReturnType<typeof createConflictCustomColumnComputer> | null {
        if (view.customColumns.length === 0) {
            return null;
        }

        const cacheKey = buildViewCacheKey(layout, view);
        const cached = customComputerCache.get(cacheKey);
        if (cached) return cached;

        const memberships = getCustomMembershipIndexes();
        const next = createConflictCustomColumnComputer({
            layout,
            membership:
                layout === ConflictGridLayout.NATION
                    ? null
                    : layout === ConflictGridLayout.COALITION
                      ? {
                            nationRowIndexesByParent:
                                memberships.nationRowIndexesByCoalitionIndex,
                            totalNationCountByParent:
                                memberships.nationCountByCoalitionIndex,
                        }
                      : {
                            nationRowIndexesByParent:
                                memberships.nationRowIndexesByAllianceIndex,
                            totalNationCountByParent:
                                memberships.nationCountByAllianceIndex,
                        },
            getMetricVector(metricLayout, metricKey) {
                const metricColumn = metricColumnByKey.get(metricKey);
                if (!metricColumn) {
                    return new Float64Array(
                        getLayoutDataset(metricLayout).rows.length,
                    );
                }
                return getMetricVector(metricLayout, metricColumn);
            },
            getRowCount(metricLayout) {
                return getLayoutDataset(metricLayout).rows.length;
            },
        });
        customComputerCache.set(cacheKey, next);
        return next;
    }

    function getCustomVector(
        layout: ConflictGridLayoutValue,
        column: ConflictGridCustomColumnSpec,
        view: ResolvedConflictGridView,
    ): Float64Array {
        const computer = getCustomComputer(layout, view);
        if (!computer) {
            return new Float64Array(getLayoutDataset(layout).rows.length);
        }
        return computer.getColumnVector(column.config);
    }

    function getNumericVector(
        layout: ConflictGridLayoutValue,
        column: ConflictGridNumericColumnSpec,
        view: ResolvedConflictGridView,
    ): Float64Array {
        return column.kind === "metric"
            ? getMetricVector(layout, column)
            : getCustomVector(layout, column, view);
    }

    function getNumericValue(
        row: ConflictRowMeta,
        column: ConflictGridNumericColumnSpec,
        view: ResolvedConflictGridView,
    ): number {
        return getNumericVector(row.layout, column, view)[row.index] ?? 0;
    }

    function buildCustomCell(
        row: ConflictRowMeta,
        column: ConflictGridCustomColumnSpec,
        view: ResolvedConflictGridView,
    ): GridCellView {
        const value = getNumericValue(row, column, view);
        if (column.config.kind === "row-formula" && column.config.formula.kind === "flag") {
            return {
                kind: "text",
                text: value > 0 ? "Yes" : "No",
            };
        }
        if (
            (column.config.kind === "row-formula" &&
                column.config.formula.kind === "numeric" &&
                column.config.formula.display === "money") ||
            (column.config.kind === "member-rollup" && column.config.display === "money")
        ) {
            return {
                kind: "money",
                text: formatMoneyValue(value),
                value,
            };
        }
        return {
            kind: "number",
            text:
                (column.config.kind === "row-formula" &&
                    column.config.formula.kind === "numeric" &&
                    column.config.formula.display === "percent") ||
                (column.config.kind === "member-rollup" && column.config.display === "percent")
                    ? `${formatNumberValue(value)}%`
                    : formatNumberValue(value),
            value,
        };
    }

    function getCell(
        row: ConflictRowMeta,
        columnKey: string,
        view: ResolvedConflictGridView,
    ): GridCellView {
        const column = getColumnSpec(row.layout, view, columnKey);
        if (!column) return { kind: "empty" };
        if (column.kind === "name") return row.nameCell;
        if (column.kind === "alliance") return row.allianceCell;
        if (column.kind === "metric") return buildMetricCell(row, column);
        return buildCustomCell(row, column, view);
    }

    function getSortValue(
        row: ConflictRowMeta,
        columnKey: string,
        view: ResolvedConflictGridView,
    ): SortValue {
        const column = getColumnSpec(row.layout, view, columnKey);
        if (!column) return null;
        if (column.kind === "name") return row.nameSortText;
        if (column.kind === "alliance") return row.allianceSortText;
        return getNumericValue(row, column, view);
    }

    function buildCoalitionRows(): ConflictRowMeta[] {
        return data.coalitions.map((coalition, coalitionIndex) => {
            const index = coalitionIndex as 0 | 1;
            const damage = coalition.damage as unknown as number[][];
            const coalitionName = coalition.name || `Coalition ${coalitionIndex + 1}`;
            return {
                id: coalitionRowId(coalitionIndex),
                index: coalitionIndex,
                layout: ConflictGridLayout.COALITION,
                coalitionIndex: index,
                rowClass: ROW_CLASS_BY_COALITION[index],
                allianceIds: uniqueNumericIds(coalition.alliance_ids),
                nationIds: uniqueNumericIds(coalition.nation_ids),
                allianceId: null,
                allianceName: null,
                nationId: null,
                nationName: null,
                nameCell: {
                    kind: "action",
                    text: coalitionName,
                    actionId: "show-coalition-members",
                    args: { coalitionIndex },
                    title: `Show alliances in ${coalitionName}`,
                },
                allianceCell: { kind: "empty" },
                nameFilterText: normalizeText(coalitionName),
                nameSortText: normalizeText(coalitionName),
                allianceFilterText: "",
                allianceSortText: "",
                exportNameCells: [coalitionName, coalitionIndex],
                exportAllianceCells: [],
                damageTaken: damage[0] ?? [],
                damageDealt: damage[1] ?? [],
            };
        });
    }

    function buildAllianceRows(): ConflictRowMeta[] {
        const rows: ConflictRowMeta[] = [];
        let rowIndex = 0;

        data.coalitions.forEach((coalition, coalitionIndex) => {
            const index = coalitionIndex as 0 | 1;
            const damage = coalition.damage as unknown as number[][];
            const offset = 2;

            coalition.alliance_ids.forEach((allianceId, allianceIndex) => {
                const allianceName = formatAllianceName(
                    coalition.alliance_names[allianceIndex],
                    allianceId,
                );
                rows.push({
                    id: allianceRowId(allianceId),
                    index: rowIndex,
                    layout: ConflictGridLayout.ALLIANCE,
                    coalitionIndex: index,
                    rowClass: ROW_CLASS_BY_COALITION[index],
                    allianceIds: [allianceId],
                    nationIds: [],
                    allianceId,
                    allianceName,
                    nationId: null,
                    nationName: null,
                    nameCell: buildAllianceLinkCell({
                        text: allianceName,
                        allianceId,
                        coalitionIndex: index,
                        conflictId,
                        routeContext: aavaRouteContext,
                    }),
                    allianceCell: buildAllianceLinkCell({
                        text: allianceName,
                        allianceId,
                        coalitionIndex: index,
                        conflictId,
                        routeContext: aavaRouteContext,
                    }),
                    nameFilterText: normalizeText(allianceName),
                    nameSortText: normalizeText(allianceName),
                    allianceFilterText: normalizeText(allianceName),
                    allianceSortText: normalizeText(allianceName),
                    exportNameCells: [allianceName, allianceId],
                    exportAllianceCells: [allianceName, allianceId],
                    damageTaken: damage[allianceIndex * 2 + offset] ?? [],
                    damageDealt: damage[allianceIndex * 2 + offset + 1] ?? [],
                });
                rowIndex += 1;
            });
        });

        return rows;
    }

    function buildNationRows(): ConflictRowMeta[] {
        const rows: ConflictRowMeta[] = [];
        let rowIndex = 0;

        data.coalitions.forEach((coalition, coalitionIndex) => {
            const index = coalitionIndex as 0 | 1;
            const damage = coalition.damage as unknown as number[][];
            const offset = 2 + coalition.alliance_ids.length * 2;

            coalition.nation_ids.forEach((nationId, nationIndex) => {
                const allianceId = numericValue(coalition.nation_aa[nationIndex]);
                const allianceName = namesByAllianceId[allianceId] ?? formatAllianceName(undefined, allianceId);
                const nationName = formatNationName(
                    coalition.nation_names[nationIndex],
                    nationId,
                );
                rows.push({
                    id: nationRowId(nationId),
                    index: rowIndex,
                    layout: ConflictGridLayout.NATION,
                    coalitionIndex: index,
                    rowClass: ROW_CLASS_BY_COALITION[index],
                    allianceIds: allianceId > 0 ? [allianceId] : [],
                    nationIds: [nationId],
                    allianceId,
                    allianceName,
                    nationId,
                    nationName,
                    nameCell: {
                        kind: "link",
                        text: nationName,
                        href: `https://politicsandwar.com/nation/id=${nationId}`,
                        external: true,
                    },
                    allianceCell: buildAllianceLinkCell({
                        text: allianceName,
                        allianceId,
                        coalitionIndex: index,
                        conflictId,
                        routeContext: aavaRouteContext,
                    }),
                    nameFilterText: normalizeText(`${nationName} ${allianceName}`),
                    nameSortText: normalizeText(nationName),
                    allianceFilterText: normalizeText(allianceName),
                    allianceSortText: normalizeText(allianceName),
                    exportNameCells: [nationName, nationId],
                    exportAllianceCells: [allianceName, allianceId],
                    damageTaken: damage[nationIndex * 2 + offset] ?? [],
                    damageDealt: damage[nationIndex * 2 + offset + 1] ?? [],
                });
                rowIndex += 1;
            });
        });

        return rows;
    }

    function buildLayoutDataset(
        layout: ConflictGridLayoutValue,
        rows: ConflictRowMeta[],
    ): ConflictLayoutDataset {
        const bootstrap = buildInternalBootstrap(
            buildLayoutColumns(layout, resolveView(layout)),
            rows.length,
        );
        return {
            layout,
            bootstrap,
            rows,
            rowMetaById: new Map(rows.map((row) => [row.id, row])),
        };
    }

    const layoutDatasetByLayout = new Map<
        ConflictGridLayoutValue,
        ConflictLayoutDataset
    >();

    function buildLayoutDatasetFor(
        layout: ConflictGridLayoutValue,
    ): ConflictLayoutDataset {
        switch (layout) {
            case ConflictGridLayout.COALITION:
                return buildLayoutDataset(layout, buildCoalitionRows());
            case ConflictGridLayout.ALLIANCE:
                return buildLayoutDataset(layout, buildAllianceRows());
            case ConflictGridLayout.NATION:
                return buildLayoutDataset(layout, buildNationRows());
        }

        throw new Error(`Unsupported conflict layout: ${String(layout)}`);
    }

    function getLayoutDataset(
        layout: ConflictGridLayoutValue,
    ): ConflictLayoutDataset {
        const cached = layoutDatasetByLayout.get(layout);
        if (cached) return cached;

        const created = buildLayoutDatasetFor(layout);
        layoutDatasetByLayout.set(layout, created);
        return created;
    }

    function getLayoutBootstrap(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
    ): GridBootstrapResult {
        const cacheKey = buildViewCacheKey(layout, view);
        const cached = bootstrapCache.get(cacheKey);
        if (cached) return cached;

        const bootstrap = buildInternalBootstrap(
            buildLayoutColumns(layout, view),
            getLayoutDataset(layout).rows.length,
        );
        bootstrapCache.set(cacheKey, bootstrap);
        return bootstrap;
    }

    function normalizeState(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): GridQueryState {
        return toGridQueryState(
            normalizeGridControllerState(getLayoutBootstrap(layout, view), state),
        );
    }

    function buildFilterSortCacheKey(
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): string {
        const filters = Object.entries(state.filters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${normalizeFilterCacheValue(value)}`)
            .join("|");
        const sort = state.sort ? `${state.sort.key}:${state.sort.dir}` : "none";
        return `${view.hash}::${sort}::${filters}`;
    }

    function matchesAllianceSelectionFilter(
        row: ConflictRowMeta,
        rawTerm: string,
    ): boolean | null {
        const selectedAllianceIds = parseGridSelectionFilterValue(rawTerm);
        if (selectedAllianceIds == null) {
            return null;
        }
        if (selectedAllianceIds.length === 0) {
            return true;
        }
        if (row.allianceId == null) {
            return false;
        }
        return selectedAllianceIds.includes(String(row.allianceId));
    }

    function serializeRowId(rowId: GridRowId): string {
        return `${typeof rowId === "number" ? "n" : "s"}:${String(rowId)}`;
    }

    function buildRowIdSequenceKey(rowIds: GridRowId[]): string {
        return `${rowIds.length}:${rowIds.map(serializeRowId).join("|")}`;
    }

    function getFilteredRowSequenceKey(
        layout: ConflictGridLayoutValue,
        view: ResolvedConflictGridView,
        state: GridQueryState,
        filteredRows: ConflictRowMeta[],
    ): string {
        const filterSortCacheKey = `${layout}::${buildFilterSortCacheKey(state, view)}`;
        const cached = filteredRowSequenceKeyCache.get(filterSortCacheKey);
        if (cached) return cached;

        const rowIds = filteredRowIdsCache.get(filterSortCacheKey) ??
            filteredRows.map((row) => row.id);
        const rowSequenceKey = buildRowIdSequenceKey(rowIds);
        filteredRowSequenceKeyCache.set(filterSortCacheKey, rowSequenceKey);
        return rowSequenceKey;
    }

    function buildSummaryCacheKey(
        filteredRowSequenceKey: string,
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): string {
        const selected = [...state.selectedRowIds]
            .map(serializeRowId)
            .sort()
            .join("|");
        const visible = [...state.visibleColumnKeys].join("|");
        return `${view.hash}::${filteredRowSequenceKey}::${visible}::${selected}`;
    }

    function buildPageResultCacheKey(options: {
        layout: ConflictGridLayoutValue;
        visibleRows: ConflictRowMeta[];
        state: GridQueryState;
        filteredRowCount: number;
        allFilteredRowsSelected: boolean;
        view: ResolvedConflictGridView;
    }): string {
        const visibleColumns = options.state.visibleColumnKeys.join("|");
        const visibleRowSequenceKey = buildRowIdSequenceKey(
            options.visibleRows.map((row) => row.id),
        );
        return `${options.layout}::${options.view.hash}::${options.filteredRowCount}::${options.allFilteredRowsSelected ? 1 : 0}::${visibleColumns}::${visibleRowSequenceKey}`;
    }

    function getFilteredSortedRows(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): ConflictRowMeta[] {
        const normalized = normalizeState(layout, state, view);
        const cacheKey = `${layout}::${buildFilterSortCacheKey(normalized, view)}`;
        const cached = filteredRowsCache.get(cacheKey);
        if (cached) return cached;
        const dataset = getLayoutDataset(layout);
        const filtered = dataset.rows.filter((row) => {
            for (const [columnKey, rawTerm] of Object.entries(normalized.filters)) {
                if (columnKey === "name") {
                    const selectionMatch =
                        layout === ConflictGridLayout.ALLIANCE
                            ? matchesAllianceSelectionFilter(row, rawTerm)
                            : null;
                    if (selectionMatch != null) {
                        if (!selectionMatch) return false;
                        continue;
                    }
                    const term = normalizeText(rawTerm);
                    if (!term) continue;
                    if (!row.nameFilterText.includes(term)) return false;
                    continue;
                }
                if (columnKey === "alliance") {
                    const selectionMatch = matchesAllianceSelectionFilter(row, rawTerm);
                    if (selectionMatch != null) {
                        if (!selectionMatch) return false;
                        continue;
                    }
                    const term = normalizeText(rawTerm);
                    if (!term) continue;
                    if (!row.allianceFilterText.includes(term)) return false;
                    continue;
                }
                return false;
            }
            return true;
        });

        if (!normalized.sort) {
            filteredRowsCache.set(cacheKey, filtered);
            filteredRowIdsCache.set(cacheKey, filtered.map((row) => row.id));
            return filtered;
        }

        const decorated = filtered.map((row) => ({
            row,
            sortValue: getSortValue(row, normalized.sort?.key ?? "name", view),
        }));

        decorated.sort((left, right) => {
            const compared = compareSortValues(
                left.sortValue,
                right.sortValue,
                normalized.sort?.dir ?? "desc",
            );
            return compared === 0 ? left.row.index - right.row.index : compared;
        });

        const sorted = decorated.map((entry) => entry.row);
        filteredRowsCache.set(cacheKey, sorted);
        filteredRowIdsCache.set(cacheKey, sorted.map((row) => row.id));
        return sorted;
    }

    function sliceRows(
        rows: ConflictRowMeta[],
        state: GridQueryState,
    ): ConflictRowMeta[] {
        const window = resolveGridRowWindow({
            pageIndex: state.pageIndex,
            pageSize: state.pageSize,
            viewport: state.viewport,
            totalRows: rows.length,
        });
        return rows.slice(window.start, window.end);
    }

    function buildPageRows(
        layout: ConflictGridLayoutValue,
        rows: ConflictRowMeta[],
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): GridPageRow[] {
        const visibleColumns = getVisibleColumns(
            getLayoutBootstrap(layout, view),
            state,
        );
        return rows.map((row) => {
            const cells: Record<string, GridCellView> = {};
            visibleColumns.forEach((column) => {
                cells[column.key] = getCell(row, column.key, view);
            });
            return {
                id: row.id,
                rowClass: row.rowClass,
                cells,
            };
        });
    }

    function buildSummary(
        layout: ConflictGridLayoutValue,
        filteredRows: ConflictRowMeta[],
        state: GridQueryState,
        view: ResolvedConflictGridView,
    ): GridSummaryByColumnKey {
        const cacheKey = `${layout}::${buildSummaryCacheKey(
            getFilteredRowSequenceKey(layout, view, state, filteredRows),
            state,
            view,
        )}`;
        const cached = summaryCache.get(cacheKey);
        if (cached) return cached;
        const visibleColumns = getVisibleColumns(
            getLayoutBootstrap(layout, view),
            state,
        );
        const selected = new Set(state.selectedRowIds);
        const activeRows = state.selectedRowIds.length > 0
            ? filteredRows.filter((row) => selected.has(row.id))
            : filteredRows;

        const summaryByColumnKey: GridSummaryByColumnKey = {};
        visibleColumns.forEach((column) => {
            const numericColumn = getNumericColumnSpec(layout, view, column.key);
            if (!numericColumn || column.summary !== "sum-avg") return;
            const vector = getNumericVector(layout, numericColumn, view);

            let count = 0;
            let sum = 0;
            activeRows.forEach((row) => {
                const value = vector[row.index] ?? 0;
                if (!Number.isFinite(value)) return;
                sum += value;
                count += 1;
            });

            summaryByColumnKey[column.key] = {
                sum: count > 0 ? sum : null,
                avg: count > 0 ? sum / count : null,
            };
        });

        summaryCache.set(cacheKey, summaryByColumnKey);
        return summaryByColumnKey;
    }

    function areAllFilteredRowsSelected(
        filteredRows: ConflictRowMeta[],
        selectedRowIds: GridRowId[],
    ): boolean {
        if (filteredRows.length === 0) return false;
        const selected = new Set(selectedRowIds);
        return filteredRows.every((row) => selected.has(row.id));
    }

    function getNameExportHeaders(layout: ConflictGridLayoutValue): string[] {
        if (layout === ConflictGridLayout.ALLIANCE) {
            return ["alliance", "alliance_id"];
        }
        if (layout === ConflictGridLayout.NATION) {
            return ["nation", "nation_id"];
        }
        return ["coalition", "coalition_index"];
    }

    function getAllianceExportHeaders(layout: ConflictGridLayoutValue): string[] {
        if (layout === ConflictGridLayout.ALLIANCE || layout === ConflictGridLayout.NATION) {
            return ["alliance", "alliance_id"];
        }
        return [];
    }

    function resolveScopeRows(
        entity: "alliance" | "nation",
        scope: WidgetScope,
        snapshot?: ScopeSnapshot,
    ): ConflictRowMeta[] {
        const layout =
            entity === "alliance"
                ? ConflictGridLayout.ALLIANCE
                : ConflictGridLayout.NATION;
        const rows = getLayoutDataset(layout).rows;

        if (scope === "all") return rows;
        if (scope === "coalition1") {
            return rows.filter((row) => row.coalitionIndex === 0);
        }
        if (scope === "coalition2") {
            return rows.filter((row) => row.coalitionIndex === 1);
        }

        const allianceIds = new Set(snapshot?.allianceIds ?? []);
        const nationIds = new Set(snapshot?.nationIds ?? []);

        if (entity === "alliance") {
            if (allianceIds.size === 0) return [];
            return rows.filter((row) => row.allianceId != null && allianceIds.has(row.allianceId));
        }

        if (nationIds.size > 0) {
            return rows.filter((row) => row.nationId != null && nationIds.has(row.nationId));
        }
        if (allianceIds.size > 0) {
            return rows.filter((row) => row.allianceId != null && allianceIds.has(row.allianceId));
        }
        return [];
    }

    function buildPresetMetrics(): ConflictGridPresetMetrics {
        const dealtColumn = metricColumnByKey.get("dealt:damage") ?? null;
        const lossColumn = metricColumnByKey.get("loss:damage") ?? null;
        const netColumn = metricColumnByKey.get("net:damage") ?? null;
        const offWarsColumn = metricColumnByKey.get("off:wars") ?? null;
        const defWarsColumn = metricColumnByKey.get("def:wars") ?? null;

        const coalitionSummary =
            dealtColumn && lossColumn && netColumn && offWarsColumn && defWarsColumn
                ? data.coalitions.slice(0, 2).map((coalition, idx) => {
                      const damage = coalition.damage as unknown as number[][];
                      const name = coalition.name || `Coalition ${idx + 1}`;
                      return {
                          idx,
                          name,
                          dealt: computeMetricValueFromArrays(
                              damage[0] ?? [],
                              damage[1] ?? [],
                              dealtColumn,
                          ),
                          received: computeMetricValueFromArrays(
                              damage[0] ?? [],
                              damage[1] ?? [],
                              lossColumn,
                          ),
                          net: computeMetricValueFromArrays(
                              damage[0] ?? [],
                              damage[1] ?? [],
                              netColumn,
                          ),
                          wars:
                              computeMetricValueFromArrays(
                                  damage[0] ?? [],
                                  damage[1] ?? [],
                                  offWarsColumn,
                              ) +
                              computeMetricValueFromArrays(
                                  damage[0] ?? [],
                                  damage[1] ?? [],
                                  defWarsColumn,
                              ),
                      };
                  })
                : null;

        const totalDamage = coalitionSummary
            ? coalitionSummary.reduce((sum, row) => sum + row.dealt, 0)
            : null;
        const warsTracked = coalitionSummary
            ? Math.max(...coalitionSummary.map((row) => row.wars))
            : null;
        const damageGap = coalitionSummary
            ? Math.max(...coalitionSummary.map((row) => Math.abs(row.net)))
            : null;
        const leadingCoalition = coalitionSummary && coalitionSummary.length > 0
            ? coalitionSummary.reduce((best, row) =>
                  row.net > best.net ? row : best,
              )
            : null;

        const offWarsPerNationStats = offWarsColumn
            ? (() => {
                  let totalOffWars = 0;
                  let totalNations = 0;

                  data.coalitions.forEach((coalition) => {
                      const damage = coalition.damage as unknown as number[][];
                      const offset = 2 + coalition.alliance_ids.length * 2;

                      coalition.nation_ids.forEach((_nationId, nationIndex) => {
                          totalOffWars += computeMetricValueFromArrays(
                              damage[nationIndex * 2 + offset] ?? [],
                              damage[nationIndex * 2 + offset + 1] ?? [],
                              offWarsColumn,
                          );
                          totalNations += 1;
                      });
                  });

                  if (totalNations === 0) return null;

                  return {
                      totalOffWars,
                      totalNations,
                      perNation: totalOffWars / totalNations,
                  };
              })()
            : null;

        return {
            coalitionSummary,
            totalDamage,
            warsTracked,
            damageGap,
            leadingCoalition,
            offWarsPerNationStats,
        };
    }

    const presetMetrics = buildPresetMetrics();
    const meta: ConflictGridMeta = {
        conflictId,
        name: data.name,
        wiki: data.wiki,
        start: data.start,
        end: data.end,
        cb: data.cb,
        status: data.status,
        posts: data.posts ?? {},
        updateMs: Number.isFinite(Number((data as { update_ms?: number }).update_ms))
            ? Number((data as { update_ms?: number }).update_ms)
            : null,
        coalitions: data.coalitions.map((coalition, coalitionIndex) => ({
            name: coalition.name || `Coalition ${coalitionIndex + 1}`,
            alliances: coalition.alliance_ids.map((allianceId, allianceIndex) => ({
                id: allianceId,
                name: formatAllianceName(
                    coalition.alliance_names[allianceIndex],
                    allianceId,
                ),
            })),
        })),
    };

    function bootstrap(
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ): ConflictGridBootstrapPayload {
        const bootstrapStartedAt = nowMs();
        const view = resolveView(layout, viewConfig);
        const bootstrap = getLayoutBootstrap(layout, view);
        return {
            datasetKey,
            meta,
            layout,
            grid: {
                columns: bootstrap.columns,
                rowCount: bootstrap.rowCount,
            },
            presetMetrics,
            timings: {
                datasetCreateMs: creationMs,
                layoutBootstrapMs: roundElapsedMs(bootstrapStartedAt),
            },
        };
    }

    function query(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ): GridPageResult {
        const view = resolveView(layout, viewConfig);
        const normalized = normalizeState(layout, state, view);
        const filteredRows = getFilteredSortedRows(layout, normalized, view);
        const visibleRows = sliceRows(filteredRows, normalized);
        const allFilteredRowsSelected = areAllFilteredRowsSelected(
            filteredRows,
            normalized.selectedRowIds,
        );
        const pageResultCacheKey = buildPageResultCacheKey({
            layout,
            visibleRows,
            state: normalized,
            filteredRowCount: filteredRows.length,
            allFilteredRowsSelected,
            view,
        });
        const cached = pageResultCache.get(pageResultCacheKey);
        if (cached) return cached;

        const result: GridPageResult = {
            totalRowCount: getLayoutDataset(layout).rows.length,
            filteredRowCount: filteredRows.length,
            allFilteredRowsSelected,
            rows: buildPageRows(layout, visibleRows, normalized, view),
            summaryByColumnKey: {},
        };
        pageResultCache.set(pageResultCacheKey, result);
        return result;
    }

    function querySummary(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ): GridSummaryByColumnKey {
        const view = resolveView(layout, viewConfig);
        const normalized = normalizeState(layout, state, view);
        const filteredRows = getFilteredSortedRows(layout, normalized, view);
        return buildSummary(layout, filteredRows, normalized, view);
    }

    function getRowDetails(
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ): GridPageRow | null {
        const dataset = getLayoutDataset(layout);
        const row = dataset.rowMetaById.get(rowId);
        if (!row) return null;
        const view = resolveView(layout, viewConfig);
        const normalized = normalizeState(layout, state, view);
        const visibleKeys = new Set(normalized.visibleColumnKeys);
        const detailColumns = getOrderedColumns(getLayoutBootstrap(layout, view), normalized).filter(
            (column) =>
                !visibleKeys.has(column.key) && column.detailsEligible !== false,
        );
        if (detailColumns.length === 0) return null;

        const cells: Record<string, GridCellView> = {};
        detailColumns.forEach((column) => {
            cells[column.key] = getCell(row, column.key, view);
        });

        return {
            id: row.id,
            rowClass: row.rowClass,
            cells,
        };
    }

    function getFilteredRowIds(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ): GridRowId[] {
        const view = resolveView(layout, viewConfig);
        const normalized = normalizeState(layout, state, view);
        const cacheKey = `${layout}::${buildFilterSortCacheKey(normalized, view)}`;
        const cached = filteredRowIdsCache.get(cacheKey);
        if (cached) return cached;
        return getFilteredSortedRows(layout, normalized, view).map((row) => row.id);
    }

    function buildRankingCacheKey(card: RankingCard): string {
        return JSON.stringify({
            kind: card.kind,
            entity: card.entity,
            metric: card.metric,
            scope: card.scope,
            limit: card.limit,
            source: card.source,
            snapshot: card.snapshot ?? null,
            aavaSnapshot: card.aavaSnapshot ?? null,
        });
    }

    function buildMetricCacheKey(card: MetricCard): string {
        return JSON.stringify({
            kind: card.kind,
            entity: card.entity,
            metric: card.metric,
            scope: card.scope,
            aggregation: card.aggregation,
            normalizeBy: card.normalizeBy ?? null,
            source: card.source,
            snapshot: card.snapshot ?? null,
            aavaSnapshot: card.aavaSnapshot ?? null,
        });
    }

    function prewarm(
        layouts: ConflictGridLayoutValue[] = ALL_CONFLICT_GRID_LAYOUTS,
        aggressive = false,
    ): ConflictGridPrewarmResult {
        const startedAt = typeof performance !== "undefined"
            ? performance.now()
            : Date.now();
        const warmedLayouts = Array.from(new Set(layouts)).filter(
            (layout): layout is ConflictGridLayoutValue =>
                ALL_CONFLICT_GRID_LAYOUTS.includes(layout),
        );
        let metricVectorsWarmed = 0;

        warmedLayouts.forEach((layout) => {
            const baseView = resolveView(layout);
            void bootstrap(layout, baseView.config);
            metricColumnByKey.forEach((column) => {
                const cacheKey = `${layout}:${column.key}`;
                if (metricVectorCache.has(cacheKey)) return;
                getMetricVector(layout, column);
                metricVectorsWarmed += 1;
            });

            if (!aggressive) return;

            const dataset = getLayoutDataset(layout);

            const warmState = normalizeState(layout, {
                sort: null,
                filters: {},
                pageIndex: 0,
                pageSize: 10,
                visibleColumnKeys: dataset.bootstrap.defaultVisibleColumnKeys,
                columnOrderKeys: dataset.bootstrap.columns.map((column) => column.key),
                expandedRowIds: [],
                selectedRowIds: [],
            }, baseView);
            void getFilteredSortedRows(layout, warmState, baseView);
        });

        const endedAt = typeof performance !== "undefined"
            ? performance.now()
            : Date.now();

        return {
            datasetKey,
            warmedLayouts,
            metricVectorsWarmed,
            elapsedMs: Math.round((endedAt - startedAt) * 100) / 100,
        };
    }

    function exportRows(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ): GridExportResult {
        const view = resolveView(layout, viewConfig);
        const normalized = normalizeState(layout, state, view);
        const visibleColumns = getVisibleColumns(
            getLayoutBootstrap(layout, view),
            normalized,
        );
        const filteredRows = getFilteredSortedRows(layout, normalized, view);
        const exportColumns: string[] = [];

        visibleColumns.forEach((column) => {
            if (column.key === "name") {
                exportColumns.push(...getNameExportHeaders(layout));
                return;
            }
            if (column.key === "alliance") {
                exportColumns.push(...getAllianceExportHeaders(layout));
                return;
            }
            exportColumns.push(column.exportLabel ?? column.title);
        });

        const rows = filteredRows.map((row) => {
            const exported: unknown[] = [];
            visibleColumns.forEach((column) => {
                if (column.key === "name") {
                    exported.push(...row.exportNameCells);
                    return;
                }
                if (column.key === "alliance") {
                    exported.push(...row.exportAllianceCells);
                    return;
                }
                const numericColumn = getNumericColumnSpec(layout, view, column.key);
                if (!numericColumn) return;
                exported.push(getNumericValue(row, numericColumn, view));
            });
            return exported;
        });

        return {
            columns: exportColumns,
            rows,
        };
    }

    function getSelectionSnapshot(
        layout: ConflictGridLayoutValue,
        selectedRowIds: GridRowId[],
    ): ScopeSnapshot {
        const allianceIds = new Set<number>();
        const nationIds = new Set<number>();
        const dataset = getLayoutDataset(layout);

        selectedRowIds.forEach((rowId) => {
            const row = dataset.rowMetaById.get(rowId);
            if (!row) return;
            row.allianceIds.forEach((id) => allianceIds.add(id));
            row.nationIds.forEach((id) => nationIds.add(id));
        });

        return buildSelectionSnapshot(allianceIds, nationIds);
    }

    function getRankingRows(card: RankingCard): ConflictKpiRankingRow[] {
        const cacheKey = buildRankingCacheKey(card);
        const cached = rankingCache.get(cacheKey);
        if (cached) return cached;

        let rows: ConflictKpiRankingRow[];
        if (card.source === "aava") {
            if (!card.aavaSnapshot || card.entity !== "alliance") return [];
            rows = buildAavaSelectionRows(data, card.aavaSnapshot)
                .map((row) => ({
                    label: row.alliance[0],
                    allianceId: row.alliance[1],
                    value: numericValue(row[card.metric as keyof typeof row]),
                    valueText: formatAavaMetricValueText(
                        numericValue(row[card.metric as keyof typeof row]),
                    ),
                }))
                .sort((left, right) => right.value - left.value)
                .slice(0, Math.max(1, card.limit));
            rankingCache.set(cacheKey, rows);
            return rows;
        }

        const metricColumn = metricColumnByKey.get(card.metric);
        if (!metricColumn) return [];

        rows = resolveScopeRows(card.entity, card.scope, card.snapshot)
            .map((row) => {
                const value = getMetricValue(row, metricColumn);
                if (card.entity === "alliance") {
                    return {
                        label:
                            row.allianceName ??
                            formatAllianceName(undefined, row.allianceId ?? 0),
                        allianceId: row.allianceId ?? undefined,
                        value,
                        valueText: formatKpiMetricValueText(metricColumn, value),
                    };
                }
                return {
                    label:
                        row.nationName ?? formatNationName(undefined, row.nationId ?? 0),
                    nationId: row.nationId ?? undefined,
                    allianceName:
                        row.allianceName ??
                        formatAllianceName(undefined, row.allianceId ?? 0),
                    allianceId: row.allianceId ?? undefined,
                    value,
                    valueText: formatKpiMetricValueText(metricColumn, value),
                };
            })
            .sort((left, right) => right.value - left.value)
            .slice(0, Math.max(1, card.limit));
        rankingCache.set(cacheKey, rows);
        return rows;
    }

    function getMetricCardValue(card: MetricCard): number | null {
        const cacheKey = buildMetricCacheKey(card);
        if (metricCardCache.has(cacheKey)) {
            return metricCardCache.get(cacheKey) ?? null;
        }

        let value: number | null;
        if (card.source === "aava") {
            if (!card.aavaSnapshot || card.entity !== "alliance") return null;
            const rows = buildAavaSelectionRows(data, card.aavaSnapshot);
            if (rows.length === 0) return null;
            const values = rows.map((row) => numericValue(row[card.metric as keyof typeof row]));

            if (card.normalizeBy) {
                const denominators = rows.map((row) =>
                    numericValue(row[card.normalizeBy as keyof typeof row]),
                );
                if (card.aggregation === "sum") {
                    const numerator = values.reduce((sum, value) => sum + value, 0);
                    const denominator = denominators.reduce(
                        (sum, value) => sum + value,
                        0,
                    );
                    value = denominator === 0 ? null : numerator / denominator;
                    metricCardCache.set(cacheKey, value);
                    return value;
                }
                const ratios = values
                    .map((value, index) => {
                        const denominator = denominators[index];
                        return denominator === 0 ? null : value / denominator;
                    })
                    .filter((value): value is number => value != null);
                value =
                    ratios.length === 0
                        ? null
                        : ratios.reduce((sum, nextValue) => sum + nextValue, 0) /
                            ratios.length;
                metricCardCache.set(cacheKey, value);
                return value;
            }

            const total = values.reduce((sum, value) => sum + value, 0);
            value = card.aggregation === "avg" ? total / values.length : total;
            metricCardCache.set(cacheKey, value);
            return value;
        }

        const metricColumn = metricColumnByKey.get(card.metric);
        if (!metricColumn) return null;
        const rows = resolveScopeRows(card.entity, card.scope, card.snapshot);
        if (rows.length === 0) return null;
        const values = rows.map((row) => getMetricValue(row, metricColumn));

        if (card.normalizeBy) {
            const normalizeColumn = metricColumnByKey.get(card.normalizeBy);
            if (!normalizeColumn) return null;
            const denominators = rows.map((row) => getMetricValue(row, normalizeColumn));
            if (card.aggregation === "sum") {
                const numerator = values.reduce((sum, value) => sum + value, 0);
                const denominator = denominators.reduce(
                    (sum, value) => sum + value,
                    0,
                );
                value = denominator === 0 ? null : numerator / denominator;
                metricCardCache.set(cacheKey, value);
                return value;
            }
            const ratios = values
                .map((value, index) => {
                    const denominator = denominators[index];
                    return denominator === 0 ? null : value / denominator;
                })
                .filter((value): value is number => value != null);
            value =
                ratios.length === 0
                    ? null
                    : ratios.reduce((sum, nextValue) => sum + nextValue, 0) /
                        ratios.length;
            metricCardCache.set(cacheKey, value);
            return value;
        }

        const total = values.reduce((sum, value) => sum + value, 0);
        value = card.aggregation === "avg" ? total / values.length : total;
        metricCardCache.set(cacheKey, value);
        return value;
    }

    const creationMs = roundElapsedMs(datasetCreateStartedAt);

    return {
        datasetKey,
        creationMs,
        bootstrap,
        prewarm,
        query,
        querySummary,
        getRowDetails,
        getFilteredRowIds,
        exportRows,
        getSelectionSnapshot,
        getRankingRows,
        getMetricCardValue,
    };
}
