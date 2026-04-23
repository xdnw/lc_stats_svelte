import type { ExportCell } from "../../dataExport";
import {
    getOrderedColumns,
    getVisibleColumns,
    normalizeGridControllerState,
    toGridQueryState,
} from "../state";
import { resolveGridRowWindow } from "../virtualization";
import type {
    GridBootstrapResult,
    GridCellView,
    GridColumnDefinition,
    GridDataProvider,
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSort,
    GridSummaryByColumnKey,
} from "../types";

type InMemorySortValue = string | number | null;

type InMemoryRowMeta<Row> = {
    id: GridRowId;
    index: number;
    raw: Row;
    rowClass: string | null;
};

export type InMemoryGridColumn<Row> = GridColumnDefinition & {
    getCell: (row: Row) => GridCellView;
    getSortValue?: (row: Row, cell: GridCellView) => InMemorySortValue;
    getFilterText?: (row: Row, cell: GridCellView) => string;
    getSummaryValue?: (row: Row, cell: GridCellView) => number | null;
    exportColumns?: string[];
    getExportCells?: (row: Row, cell: GridCellView) => ExportCell[];
};

export type InMemoryGridProviderOptions<Row> = {
    rows: Row[];
    columns: InMemoryGridColumn<Row>[];
    getRowId: (row: Row) => GridRowId;
    getRowClass?: (row: Row) => string | null | undefined;
    defaultSort?: GridSort | null;
    defaultVisibleColumnKeys?: string[];
};

function lowerCase(value: string): string {
    return value.trim().toLowerCase();
}

function cellText(cell: GridCellView): string {
    switch (cell.kind) {
        case "text":
        case "number":
        case "money":
        case "date":
        case "link":
            return cell.text;
        case "action":
            return cell.text;
        case "stack":
            return cell.items.map(cellText).join(" ");
        case "empty":
            return "";
    }
}

function defaultSortValue(cell: GridCellView): InMemorySortValue {
    switch (cell.kind) {
        case "number":
        case "money":
            return cell.value;
        case "date":
            return cell.value;
        case "text":
        case "link":
        case "action":
            return lowerCase(cell.text);
        case "stack":
            return lowerCase(cell.items.map(cellText).join(" "));
        case "empty":
            return null;
    }
}

function defaultFilterText(cell: GridCellView): string {
    return lowerCase(cellText(cell));
}

function defaultSummaryValue(cell: GridCellView): number | null {
    switch (cell.kind) {
        case "number":
        case "money":
            return cell.value;
        default:
            return null;
    }
}

function defaultExportCells(cell: GridCellView): ExportCell[] {
    switch (cell.kind) {
        case "text":
        case "number":
        case "money":
        case "date":
        case "link":
        case "action":
            return [cell.text];
        case "stack":
            return [cell.items.map(cellText).join(" | ")];
        case "empty":
            return [""];
    }
}

function compareSortValues(
    left: InMemorySortValue,
    right: InMemorySortValue,
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

export function createInMemoryGridProvider<Row>(
    options: InMemoryGridProviderOptions<Row>,
): GridDataProvider {
    const rowMetas: InMemoryRowMeta<Row>[] = options.rows.map((row, index) => ({
        id: options.getRowId(row),
        index,
        raw: row,
        rowClass: options.getRowClass?.(row) ?? null,
    }));
    const rowMetaById = new Map<GridRowId, InMemoryRowMeta<Row>>(
        rowMetas.map((row) => [row.id, row]),
    );
    const columnByKey = new Map<string, InMemoryGridColumn<Row>>(
        options.columns.map((column) => [column.key, column]),
    );
    const cellCache = new Map<GridRowId, Map<string, GridCellView>>();
    const sortCache = new Map<GridRowId, Map<string, InMemorySortValue>>();
    const filterCache = new Map<GridRowId, Map<string, string>>();
    const filteredRowsCache = new Map<string, InMemoryRowMeta<Row>[]>();
    const filteredRowIdsCache = new Map<string, GridRowId[]>();
    const filteredRowSequenceKeyCache = new Map<string, string>();
    const pageResultCache = new Map<string, GridPageResult>();
    const summaryCache = new Map<string, GridPageResult["summaryByColumnKey"]>();

    const bootstrap: GridBootstrapResult = {
        columns: options.columns.map((column) => ({
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
        })),
        defaultSort: options.defaultSort ?? null,
        defaultVisibleColumnKeys:
            options.defaultVisibleColumnKeys ??
            options.columns
                .filter((column) => !column.alwaysVisible || column.alwaysVisible)
                .map((column) => column.key),
        rowCount: rowMetas.length,
    };

    function buildFilterSortCacheKey(state: GridQueryState): string {
        const filters = Object.entries(state.filters)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}:${lowerCase(value)}`)
            .join("|");
        const sort = state.sort ? `${state.sort.key}:${state.sort.dir}` : "none";
        return `${sort}::${filters}`;
    }

    function serializeRowId(rowId: GridRowId): string {
        return `${typeof rowId === "number" ? "n" : "s"}:${String(rowId)}`;
    }

    function buildRowIdSequenceKey(rowIds: GridRowId[]): string {
        return `${rowIds.length}:${rowIds.map(serializeRowId).join("|")}`;
    }

    function getFilteredRowSequenceKey(
        state: GridQueryState,
        filteredRows: InMemoryRowMeta<Row>[],
    ): string {
        const filterSortCacheKey = buildFilterSortCacheKey(state);
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
    ): string {
        const selected = [...state.selectedRowIds]
            .map(serializeRowId)
            .sort()
            .join("|");
        const visible = [...state.visibleColumnKeys].join("|");
        return `${filteredRowSequenceKey}::${visible}::${selected}`;
    }

    function buildPageResultCacheKey(options: {
        visibleRows: InMemoryRowMeta<Row>[];
        state: GridQueryState;
        filteredRowCount: number;
        allFilteredRowsSelected: boolean;
    }): string {
        const visibleColumns = options.state.visibleColumnKeys.join("|");
        const visibleRowSequenceKey = buildRowIdSequenceKey(
            options.visibleRows.map((row) => row.id),
        );
        return `${options.filteredRowCount}::${options.allFilteredRowsSelected ? 1 : 0}::${visibleColumns}::${visibleRowSequenceKey}`;
    }

    function getCell(row: InMemoryRowMeta<Row>, columnKey: string): GridCellView {
        let rowCells = cellCache.get(row.id);
        if (!rowCells) {
            rowCells = new Map();
            cellCache.set(row.id, rowCells);
        }
        const cached = rowCells.get(columnKey);
        if (cached) return cached;

        const column = columnByKey.get(columnKey);
        if (!column) return { kind: "empty" };
        const cell = column.getCell(row.raw);
        rowCells.set(columnKey, cell);
        return cell;
    }

    function getSortValue(
        row: InMemoryRowMeta<Row>,
        columnKey: string,
    ): InMemorySortValue {
        let rowValues = sortCache.get(row.id);
        if (!rowValues) {
            rowValues = new Map();
            sortCache.set(row.id, rowValues);
        }
        if (rowValues.has(columnKey)) {
            return rowValues.get(columnKey) ?? null;
        }

        const column = columnByKey.get(columnKey);
        if (!column) return null;
        const cell = getCell(row, columnKey);
        const value = column.getSortValue
            ? column.getSortValue(row.raw, cell)
            : defaultSortValue(cell);
        rowValues.set(columnKey, value);
        return value;
    }

    function getFilterValue(row: InMemoryRowMeta<Row>, columnKey: string): string {
        let rowValues = filterCache.get(row.id);
        if (!rowValues) {
            rowValues = new Map();
            filterCache.set(row.id, rowValues);
        }
        if (rowValues.has(columnKey)) {
            return rowValues.get(columnKey) ?? "";
        }

        const column = columnByKey.get(columnKey);
        if (!column) return "";
        const cell = getCell(row, columnKey);
        const value = column.getFilterText
            ? lowerCase(column.getFilterText(row.raw, cell))
            : defaultFilterText(cell);
        rowValues.set(columnKey, value);
        return value;
    }

    function getSummaryValue(row: InMemoryRowMeta<Row>, columnKey: string): number | null {
        const column = columnByKey.get(columnKey);
        if (!column) return null;
        const cell = getCell(row, columnKey);
        return column.getSummaryValue
            ? column.getSummaryValue(row.raw, cell)
            : defaultSummaryValue(cell);
    }

    function getFilteredSortedRows(state: GridQueryState): InMemoryRowMeta<Row>[] {
        const normalized = normalizeGridControllerState(bootstrap, state);
        const cacheKey = buildFilterSortCacheKey(normalized);
        const cached = filteredRowsCache.get(cacheKey);
        if (cached) return cached;

        const filtered = rowMetas.filter((row) => {
            for (const [columnKey, rawTerm] of Object.entries(normalized.filters)) {
                const term = lowerCase(rawTerm);
                if (!term) continue;
                if (!getFilterValue(row, columnKey).includes(term)) return false;
            }
            return true;
        });

        if (!normalized.sort) {
            filteredRowsCache.set(cacheKey, filtered);
            filteredRowIdsCache.set(cacheKey, filtered.map((row) => row.id));
            return filtered;
        }

        const { key, dir } = normalized.sort;
        const sorted = [...filtered].sort((left, right) => {
            const result = compareSortValues(
                getSortValue(left, key),
                getSortValue(right, key),
                dir,
            );
            return result === 0 ? left.index - right.index : result;
        });
        filteredRowsCache.set(cacheKey, sorted);
        filteredRowIdsCache.set(cacheKey, sorted.map((row) => row.id));
        return sorted;
    }

    function buildPageRows(
        rows: InMemoryRowMeta<Row>[],
        state: GridQueryState,
    ): GridPageRow[] {
        const visibleColumns = getVisibleColumns(bootstrap, state);
        return rows.map((row) => {
            const cells: Record<string, GridCellView> = {};
            for (const column of visibleColumns) {
                cells[column.key] = getCell(row, column.key);
            }
            return {
                id: row.id,
                rowClass: row.rowClass,
                cells,
            };
        });
    }

    function buildSummary(
        filteredRows: InMemoryRowMeta<Row>[],
        state: GridQueryState,
    ): GridSummaryByColumnKey {
        const cacheKey = buildSummaryCacheKey(
            getFilteredRowSequenceKey(state, filteredRows),
            state,
        );
        const cached = summaryCache.get(cacheKey);
        if (cached) return cached;

        const visibleColumns = getVisibleColumns(bootstrap, state);
        const selectedRowIds = new Set(state.selectedRowIds);
        const activeRows =
            selectedRowIds.size > 0
                ? filteredRows.filter((row) => selectedRowIds.has(row.id))
                : filteredRows;

        const summaryByColumnKey: GridSummaryByColumnKey = {};
        for (const column of visibleColumns) {
            if (column.summary !== "sum-avg") continue;
            let count = 0;
            let sum = 0;
            for (const row of activeRows) {
                const value = getSummaryValue(row, column.key);
                if (value == null || !Number.isFinite(value)) continue;
                sum += value;
                count += 1;
            }
            summaryByColumnKey[column.key] = {
                sum: count > 0 ? sum : null,
                avg: count > 0 ? sum / count : null,
            };
        }
        summaryCache.set(cacheKey, summaryByColumnKey);
        return summaryByColumnKey;
    }

    function areAllFilteredRowsSelected(
        filteredRows: InMemoryRowMeta<Row>[],
        selectedRowIds: GridRowId[],
    ): boolean {
        if (filteredRows.length === 0) return false;
        const selected = new Set(selectedRowIds);
        return filteredRows.every((row) => selected.has(row.id));
    }

    function sliceRows(
        rows: InMemoryRowMeta<Row>[],
        state: GridQueryState,
    ): InMemoryRowMeta<Row>[] {
        const window = resolveGridRowWindow({
            pageIndex: state.pageIndex,
            pageSize: state.pageSize,
            viewport: state.viewport,
            totalRows: rows.length,
        });
        return rows.slice(window.start, window.end);
    }

    return {
        async bootstrap() {
            return bootstrap;
        },

        async query(state) {
            const normalized = toGridQueryState(
                normalizeGridControllerState(bootstrap, state),
            );
            const filteredRows = getFilteredSortedRows(normalized);
            const visibleRows = sliceRows(filteredRows, normalized);
            const allFilteredRowsSelected = areAllFilteredRowsSelected(
                filteredRows,
                normalized.selectedRowIds,
            );
            const pageResultCacheKey = buildPageResultCacheKey({
                visibleRows,
                state: normalized,
                filteredRowCount: filteredRows.length,
                allFilteredRowsSelected,
            });
            const cached = pageResultCache.get(pageResultCacheKey);
            if (cached) return cached;

            const result: GridPageResult = {
                totalRowCount: rowMetas.length,
                filteredRowCount: filteredRows.length,
                allFilteredRowsSelected,
                rows: buildPageRows(visibleRows, normalized),
                summaryByColumnKey: {},
            };
            pageResultCache.set(pageResultCacheKey, result);

            return result;
        },

        async querySummary(state) {
            const normalized = toGridQueryState(
                normalizeGridControllerState(bootstrap, state),
            );
            const filteredRows = getFilteredSortedRows(normalized);
            return buildSummary(filteredRows, normalized);
        },

        async getRowDetails(rowId, state) {
            const row = rowMetaById.get(rowId);
            if (!row) return null;
            const normalized = toGridQueryState(
                normalizeGridControllerState(bootstrap, state),
            );
            const visibleKeys = new Set(normalized.visibleColumnKeys);
            const detailColumns = getOrderedColumns(bootstrap, normalized).filter(
                (column) =>
                    !visibleKeys.has(column.key) && column.detailsEligible !== false,
            );
            if (detailColumns.length === 0) return null;

            const cells: Record<string, GridCellView> = {};
            for (const column of detailColumns) {
                cells[column.key] = getCell(row, column.key);
            }

            return {
                id: row.id,
                rowClass: row.rowClass,
                cells,
            };
        },

        async getFilteredRowIds(state) {
            const normalized = toGridQueryState(
                normalizeGridControllerState(bootstrap, state),
            );
            const cacheKey = buildFilterSortCacheKey(normalized);
            const cached = filteredRowIdsCache.get(cacheKey);
            if (cached) return cached;
            const rows = getFilteredSortedRows(normalized);
            return rows.map((row) => row.id);
        },

        async exportRows(state): Promise<GridExportResult> {
            const normalized = toGridQueryState(
                normalizeGridControllerState(bootstrap, state),
            );
            const visibleColumns = getVisibleColumns(bootstrap, normalized);
            const filteredRows = getFilteredSortedRows(normalized);
            const exportColumns: string[] = [];

            for (const visibleColumn of visibleColumns) {
                const providerColumn = columnByKey.get(visibleColumn.key);
                if (!providerColumn) continue;
                exportColumns.push(
                    ...(providerColumn.exportColumns ?? [
                        visibleColumn.exportLabel ?? visibleColumn.title,
                    ]),
                );
            }

            const rows = filteredRows.map((row) => {
                const exportedRow: ExportCell[] = [];
                for (const visibleColumn of visibleColumns) {
                    const providerColumn = columnByKey.get(visibleColumn.key);
                    if (!providerColumn) continue;
                    const cell = getCell(row, visibleColumn.key);
                    const cells = providerColumn.getExportCells
                        ? providerColumn.getExportCells(row.raw, cell)
                        : defaultExportCells(cell);
                    exportedRow.push(...cells);
                }
                return exportedRow;
            });

            return {
                columns: exportColumns,
                rows,
            };
        },
    };
}
