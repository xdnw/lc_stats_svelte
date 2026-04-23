import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { ConflictGridBootstrapPayload } from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";

export type ConflictGridProviderClient = {
    bootstrap: (
        layout: ConflictGridLayoutValue,
    ) => Promise<ConflictGridBootstrapPayload>;
    query: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridPageResult>;
    querySummary: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridSummaryByColumnKey>;
    getRowDetails: (
        layout: ConflictGridLayoutValue,
        rowId: GridRowId,
        state: GridQueryState,
    ) => Promise<GridPageRow | null>;
    getFilteredRowIds: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridRowId[]>;
    exportRows: (
        layout: ConflictGridLayoutValue,
        state: GridQueryState,
    ) => Promise<GridExportResult>;
};
