import type { SelectionModalItem } from "../selection/types";

export type GridRowId = string | number;
export type GridCellActionArgs = Record<string, string | number | boolean | null>;

export type GridCellView =
    | { kind: "text"; text: string }
    | { kind: "number"; text: string; value: number }
    | { kind: "money"; text: string; value: number }
    | { kind: "date"; text: string; value: number | null }
    | { kind: "link"; text: string; href: string; external?: boolean }
    | {
          kind: "action";
          text: string;
          actionId: string;
          args?: GridCellActionArgs;
          disabled?: boolean;
          title?: string;
                    href?: string;
                    external?: boolean;
      }
    | { kind: "stack"; items: GridCellView[] }
    | { kind: "empty" };

export type GridSortKind = false | "text" | "number" | "date";
export type GridPageSize = 10 | 25 | 50 | 100 | "all";

export type GridColumnTextFilterUi = {
    kind: "text";
    placeholder?: string;
};

export type GridColumnSelectionFilterUi = {
    kind: "selection";
    title?: string;
    description?: string;
    searchPlaceholder?: string;
    selectedCountLabel?: string;
    applyLabel?: string;
    items: SelectionModalItem[];
};

export type GridColumnFilterUi =
    | GridColumnTextFilterUi
    | GridColumnSelectionFilterUi;

export type GridColumnDefinition = {
    key: string;
    title: string;
    toneClass?: string;
    widthHint?: "fit" | "text" | "wide";
    sortable: GridSortKind;
    filterable: boolean;
    filterUi?: GridColumnFilterUi | null;
    summary?: null | "sum-avg";
    detailsEligible?: boolean;
    exportLabel?: string;
    alwaysVisible?: boolean;
};

export type GridSort = {
    key: string;
    dir: "asc" | "desc";
};

export type GridViewport = {
    start: number;
    end: number;
};

export type GridQueryState = {
    sort: GridSort | null;
    filters: Record<string, string>;
    pageIndex: number;
    pageSize: GridPageSize;
    visibleColumnKeys: string[];
    columnOrderKeys: string[];
    expandedRowIds: GridRowId[];
    selectedRowIds: GridRowId[];
    viewport?: GridViewport;
};

export type GridControllerState = GridQueryState & {
    selectionAnchorRowId: GridRowId | null;
};

export type GridBootstrapResult = {
    columns: GridColumnDefinition[];
    defaultSort: GridSort | null;
    defaultVisibleColumnKeys: string[];
    rowCount: number;
};

export type GridPageRow = {
    id: GridRowId;
    rowClass?: string | null;
    cells: Record<string, GridCellView>;
};

export type GridSummaryValue = {
    sum: number | null;
    avg: number | null;
};

export type GridSummaryByColumnKey = Record<string, GridSummaryValue>;

export type GridPageResult = {
    totalRowCount: number;
    filteredRowCount: number;
    allFilteredRowsSelected: boolean;
    rows: GridPageRow[];
    summaryByColumnKey: GridSummaryByColumnKey;
};

export type GridExportResult = {
    columns: string[];
    rows: unknown[][];
};

export interface GridDataProvider {
    bootstrap(): Promise<GridBootstrapResult>;
    query(state: GridQueryState): Promise<GridPageResult>;
    querySummary(state: GridQueryState): Promise<GridSummaryByColumnKey>;
    getRowDetails(
        rowId: GridRowId,
        state: GridQueryState,
    ): Promise<GridPageRow | null>;
    getFilteredRowIds(state: GridQueryState): Promise<GridRowId[]>;
    exportRows(state: GridQueryState): Promise<GridExportResult>;
}
