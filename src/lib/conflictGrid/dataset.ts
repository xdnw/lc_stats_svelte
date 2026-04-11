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
import { formatMoneyValue, formatNumberValue } from "../numberFormatting";
import type { Conflict } from "../types";
import {
    buildConflictGridColumnSpecs,
    isConflictMetricColumnSpec,
    type ConflictGridAllianceColumnSpec,
    type ConflictGridColumnSpec,
    type ConflictGridMetricColumnSpec,
    type ConflictGridNameColumnSpec,
} from "./conflictGridColumns";
import type {
    ConflictGridBootstrapPayload,
    ConflictGridMeta,
    ConflictGridPrewarmResult,
    ConflictGridPresetMetrics,
    ConflictKpiRankingRow,
} from "./protocol";
import {
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

const ROW_CLASS_BY_COALITION: Record<0 | 1, string> = {
    0: "ux-conflict-row-c1",
    1: "ux-conflict-row-c2",
};

const ALL_CONFLICT_LAYOUTS: ConflictGridLayoutValue[] = [
    ConflictGridLayout.COALITION,
    ConflictGridLayout.ALLIANCE,
    ConflictGridLayout.NATION,
];

function normalizeText(value: string): string {
    return value.trim().toLowerCase();
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

export function createConflictGridDataset(options: {
    datasetKey: string;
    conflictId: string;
    data: Conflict;
}) {
    const { data, conflictId, datasetKey } = options;
    const columnSpecs = buildConflictGridColumnSpecs(data);
    const columnSpecByKey = new Map<string, ConflictGridColumnSpec>(
        columnSpecs.map((column) => [column.key, column]),
    );
    const nameColumn = columnSpecByKey.get("name") as ConflictGridNameColumnSpec;
    const allianceColumn = columnSpecByKey.get("alliance") as ConflictGridAllianceColumnSpec;
    const metricColumnByKey = new Map<string, ConflictGridMetricColumnSpec>(
        columnSpecs
            .filter(isConflictMetricColumnSpec)
            .map((column) => [column.key, column]),
    );
    const namesByAllianceId: Record<number, string> = {};
    const filteredRowsCache = new Map<string, ConflictRowMeta[]>();
    const filteredRowIdsCache = new Map<string, GridRowId[]>();
    const summaryCache = new Map<string, GridSummaryByColumnKey>();
    const metricVectorCache = new Map<string, Float64Array>();
    const rankingCache = new Map<string, ConflictKpiRankingRow[]>();
    const metricCardCache = new Map<string, number | null>();

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
            sortable: column.sortable,
            filterable: column.filterable,
            summary: column.summary ?? null,
            detailsEligible: column.detailsEligible,
            exportLabel: column.exportLabel,
            alwaysVisible: column.alwaysVisible,
            ...overrides,
        };
    }

    function buildLayoutColumns(
        layout: ConflictGridLayoutValue,
    ): GridBootstrapResult["columns"] {
        const metricColumns = columnSpecs
            .filter(isConflictMetricColumnSpec)
            .map((column) => toBootstrapColumn(column));

        if (layout === ConflictGridLayout.COALITION) {
            return [
                toBootstrapColumn(nameColumn, {
                    title: "Coalition",
                    alwaysVisible: true,
                }),
                ...metricColumns,
            ];
        }

        if (layout === ConflictGridLayout.ALLIANCE) {
            return [
                toBootstrapColumn(nameColumn, {
                    title: "Alliance",
                    alwaysVisible: true,
                }),
                ...metricColumns,
            ];
        }

        return [
            toBootstrapColumn(allianceColumn, {
                title: "Alliance",
                alwaysVisible: true,
            }),
            toBootstrapColumn(nameColumn, {
                title: "Nation",
                alwaysVisible: true,
            }),
            ...metricColumns,
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
        const taken = numericValue(row.damageTaken[column.headerIndex]);
        const dealt = numericValue(row.damageDealt[column.headerIndex]);

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

        const rows = layoutDatasets[layout].rows;
        const vector = new Float64Array(rows.length);
        rows.forEach((row) => {
            vector[row.index] = computeMetricValue(row, column);
        });
        metricVectorCache.set(cacheKey, vector);
        return vector;
    }

    function getCell(row: ConflictRowMeta, columnKey: string): GridCellView {
        const column = columnSpecByKey.get(columnKey);
        if (!column) return { kind: "empty" };
        if (column.kind === "name") return row.nameCell;
        if (column.kind === "alliance") return row.allianceCell;
        return buildMetricCell(row, column);
    }

    function getSortValue(row: ConflictRowMeta, columnKey: string): SortValue {
        const column = columnSpecByKey.get(columnKey);
        if (!column) return null;
        if (column.kind === "name") return row.nameSortText;
        if (column.kind === "alliance") return row.allianceSortText;
        return getMetricValue(row, column);
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
                    nameCell: {
                        kind: "link",
                        text: allianceName,
                        href: `https://politicsandwar.com/alliance/id=${allianceId}`,
                        external: true,
                    },
                    allianceCell: {
                        kind: "link",
                        text: allianceName,
                        href: `https://politicsandwar.com/alliance/id=${allianceId}`,
                        external: true,
                    },
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
                    allianceCell: {
                        kind: "link",
                        text: allianceName,
                        href: `https://politicsandwar.com/alliance/id=${allianceId}`,
                        external: true,
                    },
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
        const bootstrap = buildInternalBootstrap(buildLayoutColumns(layout), rows.length);
        return {
            layout,
            bootstrap,
            rows,
            rowMetaById: new Map(rows.map((row) => [row.id, row])),
        };
    }

    const layoutDatasets: Record<ConflictGridLayoutValue, ConflictLayoutDataset> = {
        [ConflictGridLayout.COALITION]: buildLayoutDataset(
            ConflictGridLayout.COALITION,
            buildCoalitionRows(),
        ),
        [ConflictGridLayout.ALLIANCE]: buildLayoutDataset(
            ConflictGridLayout.ALLIANCE,
            buildAllianceRows(),
        ),
        [ConflictGridLayout.NATION]: buildLayoutDataset(
            ConflictGridLayout.NATION,
            buildNationRows(),
        ),
    };

    function normalizeState(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ): GridQueryState {
        return toGridQueryState(
            normalizeGridControllerState(layoutDatasets[layout].bootstrap, state),
        );
    }

    function buildFilterSortCacheKey(state: GridQueryState): string {
        const filters = Object.entries(state.filters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${normalizeText(value)}`)
            .join("|");
        const sort = state.sort ? `${state.sort.key}:${state.sort.dir}` : "none";
        return `${sort}::${filters}`;
    }

    function buildSummaryCacheKey(state: GridQueryState): string {
        const selected = [...state.selectedRowIds].map(String).sort().join("|");
        const visible = [...state.visibleColumnKeys].join("|");
        return `${buildFilterSortCacheKey(state)}::${visible}::${selected}`;
    }

    function getFilteredSortedRows(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ): ConflictRowMeta[] {
        const normalized = normalizeState(layout, state);
        const cacheKey = `${layout}::${buildFilterSortCacheKey(normalized)}`;
        const cached = filteredRowsCache.get(cacheKey);
        if (cached) return cached;
        const dataset = layoutDatasets[layout];
        const filtered = dataset.rows.filter((row) => {
            for (const [columnKey, rawTerm] of Object.entries(normalized.filters)) {
                const term = normalizeText(rawTerm);
                if (!term) continue;
                if (columnKey === "name") {
                    if (!row.nameFilterText.includes(term)) return false;
                    continue;
                }
                if (columnKey === "alliance") {
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
            sortValue: getSortValue(row, normalized.sort?.key ?? "name"),
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
    ): GridPageRow[] {
        const visibleColumns = getVisibleColumns(
            layoutDatasets[layout].bootstrap,
            state,
        );
        return rows.map((row) => {
            const cells: Record<string, GridCellView> = {};
            visibleColumns.forEach((column) => {
                cells[column.key] = getCell(row, column.key);
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
    ): GridSummaryByColumnKey {
        const cacheKey = `${layout}::${buildSummaryCacheKey(state)}`;
        const cached = summaryCache.get(cacheKey);
        if (cached) return cached;
        const visibleColumns = getVisibleColumns(
            layoutDatasets[layout].bootstrap,
            state,
        );
        const selected = new Set(state.selectedRowIds);
        const activeRows = state.selectedRowIds.length > 0
            ? filteredRows.filter((row) => selected.has(row.id))
            : filteredRows;

        const summaryByColumnKey: GridSummaryByColumnKey = {};
        visibleColumns.forEach((column) => {
            const metricColumn = metricColumnByKey.get(column.key);
            if (!metricColumn || column.summary !== "sum-avg") return;
            const vector = getMetricVector(layout, metricColumn);

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
        const rows = layoutDatasets[layout].rows;

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
        const coalitionRows = layoutDatasets[ConflictGridLayout.COALITION].rows;
        const nationRows = layoutDatasets[ConflictGridLayout.NATION].rows;
        const dealtColumn = metricColumnByKey.get("dealt:damage") ?? null;
        const lossColumn = metricColumnByKey.get("loss:damage") ?? null;
        const netColumn = metricColumnByKey.get("net:damage") ?? null;
        const offWarsColumn = metricColumnByKey.get("off:wars") ?? null;
        const defWarsColumn = metricColumnByKey.get("def:wars") ?? null;

        const coalitionSummary =
            dealtColumn && lossColumn && netColumn && offWarsColumn && defWarsColumn
                ? coalitionRows.slice(0, 2).map((row, idx) => ({
                      idx,
                      name:
                          row.nameCell.kind === "text" ||
                          row.nameCell.kind === "action"
                              ? row.nameCell.text
                              : `Coalition ${idx + 1}`,
                      dealt: getMetricValue(row, dealtColumn),
                      received: getMetricValue(row, lossColumn),
                      net: getMetricValue(row, netColumn),
                      wars:
                          getMetricValue(row, offWarsColumn) +
                          getMetricValue(row, defWarsColumn),
                  }))
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

        const offWarsPerNationStats = offWarsColumn && nationRows.length > 0
            ? (() => {
                  const totalOffWars = nationRows.reduce(
                      (sum, row) => sum + getMetricValue(row, offWarsColumn),
                      0,
                  );
                  return {
                      totalOffWars,
                      totalNations: nationRows.length,
                      perNation: totalOffWars / nationRows.length,
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
    ): ConflictGridBootstrapPayload {
        const dataset = layoutDatasets[layout];
        return {
            datasetKey,
            meta,
            layout,
            grid: {
                columns: dataset.bootstrap.columns,
                rowCount: dataset.bootstrap.rowCount,
            },
            presetMetrics,
        };
    }

    function query(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ): GridPageResult {
        const normalized = normalizeState(layout, state);
        const filteredRows = getFilteredSortedRows(layout, normalized);
        const visibleRows = sliceRows(filteredRows, normalized);
        return {
            totalRowCount: layoutDatasets[layout].rows.length,
            filteredRowCount: filteredRows.length,
            allFilteredRowsSelected: areAllFilteredRowsSelected(
                filteredRows,
                normalized.selectedRowIds,
            ),
            rows: buildPageRows(layout, visibleRows, normalized),
            summaryByColumnKey: {},
        };
    }

    function querySummary(
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ): GridSummaryByColumnKey {
        const normalized = normalizeState(layout, state);
        const filteredRows = getFilteredSortedRows(layout, normalized);
        return buildSummary(layout, filteredRows, normalized);
    }

    function getRowDetails(
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
    ): GridPageRow | null {
        const dataset = layoutDatasets[layout];
        const row = dataset.rowMetaById.get(rowId);
        if (!row) return null;
        const normalized = normalizeState(layout, state);
        const visibleKeys = new Set(normalized.visibleColumnKeys);
        const detailColumns = getOrderedColumns(dataset.bootstrap, normalized).filter(
            (column) =>
                !visibleKeys.has(column.key) && column.detailsEligible !== false,
        );
        if (detailColumns.length === 0) return null;

        const cells: Record<string, GridCellView> = {};
        detailColumns.forEach((column) => {
            cells[column.key] = getCell(row, column.key);
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
    ): GridRowId[] {
        const normalized = normalizeState(layout, state);
        const cacheKey = `${layout}::${buildFilterSortCacheKey(normalized)}`;
        const cached = filteredRowIdsCache.get(cacheKey);
        if (cached) return cached;
        return getFilteredSortedRows(layout, normalized).map((row) => row.id);
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
        layouts: ConflictGridLayoutValue[] = ALL_CONFLICT_LAYOUTS,
        aggressive = false,
    ): ConflictGridPrewarmResult {
        const startedAt = typeof performance !== "undefined"
            ? performance.now()
            : Date.now();
        const warmedLayouts = Array.from(new Set(layouts)).filter(
            (layout): layout is ConflictGridLayoutValue =>
                ALL_CONFLICT_LAYOUTS.includes(layout),
        );
        let metricVectorsWarmed = 0;

        warmedLayouts.forEach((layout) => {
            void bootstrap(layout);
            metricColumnByKey.forEach((column) => {
                const cacheKey = `${layout}:${column.key}`;
                if (metricVectorCache.has(cacheKey)) return;
                getMetricVector(layout, column);
                metricVectorsWarmed += 1;
            });

            if (!aggressive) return;

            const warmState = normalizeState(layout, {
                sort: null,
                filters: {},
                pageIndex: 0,
                pageSize: 10,
                visibleColumnKeys:
                    layoutDatasets[layout].bootstrap.defaultVisibleColumnKeys,
                columnOrderKeys: layoutDatasets[layout].bootstrap.columns.map(
                    (column) => column.key,
                ),
                expandedRowIds: [],
                selectedRowIds: [],
            });
            void getFilteredSortedRows(layout, warmState);
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
    ): GridExportResult {
        const normalized = normalizeState(layout, state);
        const visibleColumns = getVisibleColumns(
            layoutDatasets[layout].bootstrap,
            normalized,
        );
        const filteredRows = getFilteredSortedRows(layout, normalized);
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
                const metricColumn = metricColumnByKey.get(column.key);
                if (!metricColumn) return;
                exported.push(getMetricValue(row, metricColumn));
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
        const dataset = layoutDatasets[layout];

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

    return {
        datasetKey,
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
