import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { ConflictGridLayoutValue } from "../conflictGrid/rowIds";
import type { ConflictGridPrewarmResult } from "../conflictGrid/protocol";
import type {
    CompositeConflictGridBootstrapPayload,
    CompositeConflictGridDatasetRef,
    CompositeConflictGridResolveResult,
} from "./protocol";

export type CompositeConflictGridClient = {
    readonly conflictId: string;
    readonly datasetRef: CompositeConflictGridDatasetRef;
    bootstrap: (
        layout: ConflictGridLayoutValue,
    ) => Promise<CompositeConflictGridBootstrapPayload>;
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
    prewarmLayouts: (
        layouts?: ConflictGridLayoutValue[],
        aggressive?: boolean,
    ) => Promise<ConflictGridPrewarmResult>;
    destroy: () => void;
};

export type CompositeConflictGridSession = {
    resolve: () => Promise<CompositeConflictGridResolveResult>;
    createClient: (selectedAllianceId: number) => CompositeConflictGridClient;
    destroy: () => void;
};
