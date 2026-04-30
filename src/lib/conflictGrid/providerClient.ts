import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type {
    ConflictGridBootstrapPayload,
    ConflictGridViewConfig,
} from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";

export type ConflictGridProviderClient = {
    bootstrap: (
        layout: ConflictGridLayoutValue,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<ConflictGridBootstrapPayload>;
    query: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridPageResult>;
    querySummary: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridSummaryByColumnKey>;
    getRowDetails: (
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridPageRow | null>;
    getFilteredRowIds: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridRowId[]>;
    exportRows: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
        viewConfig?: ConflictGridViewConfig,
    ) => Promise<GridExportResult>;
};
