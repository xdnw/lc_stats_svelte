import type {
    OffWarsPerNationStats,
    CoalitionSummaryRow,
} from "../conflictKpiPresetComputations";
import type {
    GridBootstrapResult,
    GridExportResult,
    GridPageResult,
    GridPageRow,
    GridQueryState,
    GridRowId,
    GridSummaryByColumnKey,
} from "../grid/types";
import type { MetricCard, RankingCard, ScopeSnapshot } from "../kpi";
import type { ConflictGridLayoutValue } from "./rowIds";

export type ConflictGridDatasetRef = {
    datasetKey: string;
    conflictId: string;
    url: string;
    version: string;
    basePath?: string;
};

export type ConflictGridMeta = {
    conflictId: string;
    name: string;
    wiki: string;
    start: number;
    end: number;
    cb: string;
    status: string;
    posts: Record<string, [number, string, number]>;
    updateMs: number | null;
    coalitions: Array<{
        name: string;
        alliances: Array<{ id: number; name: string }>;
    }>;
};

export type ConflictGridPresetMetrics = {
    coalitionSummary: CoalitionSummaryRow[] | null;
    totalDamage: number | null;
    warsTracked: number | null;
    damageGap: number | null;
    leadingCoalition: CoalitionSummaryRow | null;
    offWarsPerNationStats: OffWarsPerNationStats | null;
};

export type ConflictGridLayoutBootstrap = {
    columns: GridBootstrapResult["columns"];
    rowCount: number;
};

export type ConflictGridBootstrapTimings = {
    datasetCreateMs: number;
    layoutBootstrapMs: number;
};

export type ConflictGridBootstrapPayload = {
    datasetKey: string;
    meta: ConflictGridMeta;
    layout: ConflictGridLayoutValue;
    grid: ConflictGridLayoutBootstrap;
    presetMetrics: ConflictGridPresetMetrics;
    timings: ConflictGridBootstrapTimings;
};

export type ConflictGridPrewarmResult = {
    datasetKey: string;
    warmedLayouts: ConflictGridLayoutValue[];
    metricVectorsWarmed: number;
    elapsedMs: number;
};

export type ConflictKpiRankingRow = {
    label: string;
    nationId?: number;
    allianceName?: string;
    allianceId?: number;
    value: number;
    valueText: string;
};

export type ConflictGridBootstrapRequest = {
    id: number;
    action: "bootstrap";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
};

export type ConflictGridTableQueryRequest = {
    id: number;
    action: "tableQuery";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type ConflictGridSummaryQueryRequest = {
    id: number;
    action: "summaryQuery";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type ConflictGridRowDetailsRequest = {
    id: number;
    action: "rowDetails";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    rowId: GridRowId;
    state: GridQueryState;
};

export type ConflictGridFilteredRowIdsRequest = {
    id: number;
    action: "filteredRowIds";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type ConflictGridExportRequest = {
    id: number;
    action: "export";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    state: GridQueryState;
};

export type ConflictGridSelectionSnapshotRequest = {
    id: number;
    action: "selectionSnapshot";
    dataset: ConflictGridDatasetRef;
    layout: ConflictGridLayoutValue;
    selectedRowIds: GridRowId[];
};

export type ConflictGridRankingRequest = {
    id: number;
    action: "ranking";
    dataset: ConflictGridDatasetRef;
    card: RankingCard;
};

export type ConflictGridMetricRequest = {
    id: number;
    action: "metric";
    dataset: ConflictGridDatasetRef;
    card: MetricCard;
};

export type ConflictGridPrewarmRequest = {
    id: number;
    action: "prewarm";
    dataset: ConflictGridDatasetRef;
    layouts?: ConflictGridLayoutValue[];
    aggressive?: boolean;
};

export type ConflictGridReleaseRequest = {
    id: number;
    action: "release";
    datasetKey: string;
};

export type ConflictGridWorkerRequest =
    | ConflictGridBootstrapRequest
    | ConflictGridTableQueryRequest
    | ConflictGridSummaryQueryRequest
    | ConflictGridRowDetailsRequest
    | ConflictGridFilteredRowIdsRequest
    | ConflictGridExportRequest
    | ConflictGridSelectionSnapshotRequest
    | ConflictGridRankingRequest
    | ConflictGridMetricRequest
    | ConflictGridPrewarmRequest
    | ConflictGridReleaseRequest;

export type ConflictGridWorkerSuccessMap = {
    bootstrap: ConflictGridBootstrapPayload;
    tableQuery: GridPageResult;
    summaryQuery: GridSummaryByColumnKey;
    rowDetails: GridPageRow | null;
    filteredRowIds: GridRowId[];
    export: GridExportResult;
    selectionSnapshot: ScopeSnapshot;
    ranking: ConflictKpiRankingRow[];
    metric: number | null;
    prewarm: ConflictGridPrewarmResult;
    release: { released: boolean };
};
