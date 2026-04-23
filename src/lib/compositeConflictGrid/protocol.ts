import type {
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { CompositeMergeDiagnostics } from "../compositeMerge";
import type { ConflictGridBootstrapPayload, ConflictGridPrewarmResult } from "../conflictGrid/protocol";
import type { ConflictGridLayoutValue } from "../conflictGrid/rowIds";
import type { CompositeAllianceOption } from "../compositeConflictSelection";

export type CompositeConflictGridSourceConflict = {
    id: string;
    url: string;
};

export type CompositeConflictGridDatasetRef = {
    datasetKey: string;
    signature: string;
    conflicts: CompositeConflictGridSourceConflict[];
    selectedAllianceId: number;
    version: string;
};

export type CompositeConflictGridResolveResult = {
    signature: string;
    resolvedConflictIds: string[];
    failedConflictIds: string[];
    allianceOptions: CompositeAllianceOption[];
    defaultAllianceId: number | null;
    noCommonAllianceDetails: string[];
};

export type CompositeConflictGridBootstrapPayload = ConflictGridBootstrapPayload & {
    composite: {
        diagnostics: CompositeMergeDiagnostics;
        warnings: string[];
        resolvedConflictIds: string[];
        failedConflictIds: string[];
        selectedAllianceId: number;
    };
};

export type CompositeConflictGridResolveRequest = {
    id: number;
    action: "resolve";
    signature: string;
    conflicts: CompositeConflictGridSourceConflict[];
    version: string;
};

export type CompositeConflictGridBootstrapRequest = {
    id: number;
    action: "bootstrap";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
};

export type CompositeConflictGridTableQueryRequest = {
    id: number;
    action: "tableQuery";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type CompositeConflictGridSummaryQueryRequest = {
    id: number;
    action: "summaryQuery";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type CompositeConflictGridRowDetailsRequest = {
    id: number;
    action: "rowDetails";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    rowId: GridRowId;
    state: GridQueryState;
};

export type CompositeConflictGridFilteredRowIdsRequest = {
    id: number;
    action: "filteredRowIds";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type CompositeConflictGridExportRequest = {
    id: number;
    action: "export";
    dataset: CompositeConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type CompositeConflictGridPrewarmRequest = {
    id: number;
    action: "prewarm";
    dataset: CompositeConflictGridDatasetRef;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
};

export type CompositeConflictGridWorkerRequest =
    | CompositeConflictGridResolveRequest
    | CompositeConflictGridBootstrapRequest
    | CompositeConflictGridTableQueryRequest
    | CompositeConflictGridSummaryQueryRequest
    | CompositeConflictGridRowDetailsRequest
    | CompositeConflictGridFilteredRowIdsRequest
    | CompositeConflictGridExportRequest
    | CompositeConflictGridPrewarmRequest;

export type CompositeConflictGridWorkerSuccessMap = {
    resolve: CompositeConflictGridResolveResult;
    bootstrap: CompositeConflictGridBootstrapPayload;
    tableQuery: GridPageResult;
    summaryQuery: GridSummaryByColumnKey;
    rowDetails: GridPageRow | null;
    filteredRowIds: GridRowId[];
    export: GridExportResult;
    prewarm: ConflictGridPrewarmResult;
};
