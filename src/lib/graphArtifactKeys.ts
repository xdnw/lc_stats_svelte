import type { TierMetric } from "./types";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "./bubbleAggregation";
import {
    buildCityRangeCacheKey,
    DEFAULT_CITY_RANGE,
    type CityRange,
} from "./cityRange";

export const DEFAULT_BUBBLE_METRICS: [TierMetric, TierMetric, TierMetric] = [
    { name: "dealt:loss_value", cumulative: true, normalize: false },
    { name: "loss:loss_value", cumulative: true, normalize: false },
    { name: "off:wars", cumulative: true, normalize: false },
];

export const DEFAULT_TIERING_METRICS: TierMetric[] = [
    { name: "nation", cumulative: false, normalize: false },
];

function buildMetricKey(metrics: TierMetric[]): string {
    return metrics
        .map(
            (metric) =>
                `${metric.name}:${metric.normalize ? 1 : 0}:${metric.cumulative ? 1 : 0}`,
        )
        .join("|");
}

function buildAllianceSequenceKey(allianceIds: number[][]): string {
    return allianceIds.map((ids) => ids.join(".")).join("|");
}

export function buildDefaultAllianceIdsByCoalition(data: {
    coalitions: Array<{ alliance_ids: number[] }>;
}): number[][] {
    return data.coalitions.map((coalition) => [...coalition.alliance_ids]);
}

export function buildDefaultAllianceIds(data: {
    coalitions: Array<{ alliance_ids: number[] }>;
}): number[][] {
    return buildDefaultAllianceIdsByCoalition(data);
}

export function buildDefaultTieringAllianceIds(data: {
    coalitions: Array<{ alliance_ids: number[] }>;
}): number[][] {
    return buildDefaultAllianceIds(data);
}

export function buildSelectedAllianceIdsByCoalition(
    data: {
        coalitions: Array<{ alliance_ids: number[] }>;
    },
    selectedAllianceIds: Iterable<number>,
): number[][] {
    const selectedAllianceIdSet = new Set(selectedAllianceIds);
    return data.coalitions.map((coalition) =>
        coalition.alliance_ids.filter((id) => selectedAllianceIdSet.has(id)),
    );
}

export function isDefaultAllianceSelection(
    allianceIds: number[][],
    defaultAllianceIds: number[][],
): boolean {
    if (allianceIds.length !== defaultAllianceIds.length) return false;

    return allianceIds.every((ids, coalitionIndex) => {
        const expected = defaultAllianceIds[coalitionIndex] ?? [];
        if (ids.length !== expected.length) return false;
        return ids.every((id, idIndex) => id === expected[idIndex]);
    });
}

export function isDefaultTieringAllianceSelection(
    allianceIds: number[][],
    defaultAllianceIds: number[][],
): boolean {
    return isDefaultAllianceSelection(allianceIds, defaultAllianceIds);
}

export function buildAllianceSelectionKey(
    allianceIds: number[][],
    options?: { defaultAllianceIds?: number[][] },
): string {
    if (
        options?.defaultAllianceIds &&
        isDefaultAllianceSelection(allianceIds, options.defaultAllianceIds)
    ) {
        return "all";
    }

    return buildAllianceSequenceKey(allianceIds);
}

export function buildTieringAllianceSelectionKey(
    allianceIds: number[][],
    options?: { defaultAllianceIds?: number[][] },
): string {
    return buildAllianceSelectionKey(allianceIds, options);
}

export function buildBubbleDatasetKey(
    conflictId: string,
    graphVersion: string | number,
): string {
    return `bubble:${conflictId}:${String(graphVersion)}`;
}

export function buildTieringDatasetKey(
    conflictId: string,
    graphVersion: string | number,
): string {
    return `tiering:${conflictId}:${String(graphVersion)}`;
}

export function buildMetricTimeDatasetKey(
    conflictId: string,
    graphVersion: string | number,
): string {
    return `metric-time:${conflictId}:${String(graphVersion)}`;
}

export function buildBubbleTraceCacheKey(options: {
    conflictId: string;
    graphVersion: string | number;
    metrics: [TierMetric, TierMetric, TierMetric];
    allianceIds?: number[][];
    allianceKey?: string;
    defaultAllianceIds?: number[][];
    aggregationMode?: BubbleAggregationMode;
    cityRange: CityRange;
}): string {
    const allianceKey =
        options.allianceKey ??
        buildAllianceSelectionKey(options.allianceIds ?? [], {
            defaultAllianceIds: options.defaultAllianceIds,
        });

    const aggregationMode =
        options.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE;

    return `${options.conflictId}:v${String(options.graphVersion)}|${buildMetricKey(options.metrics)}|agg:${aggregationMode}|${allianceKey}|${buildCityRangeCacheKey(options.cityRange)}`;
}

export function buildTieringDatasetCacheKey(options: {
    conflictId: string;
    graphVersion: string | number;
    metrics: TierMetric[];
    allianceIds?: number[][];
    allianceKey?: string;
    defaultAllianceIds?: number[][];
    useSingleColor: boolean;
    cityBandSize: number;
}): string {
    const allianceKey =
        options.allianceKey ??
        buildAllianceSelectionKey(options.allianceIds ?? [], {
            defaultAllianceIds: options.defaultAllianceIds,
        });

    return `${options.conflictId}:v${String(options.graphVersion)}|${buildMetricKey(options.metrics)}|${allianceKey}|${options.useSingleColor ? 1 : 0}|band:${options.cityBandSize > 1 ? options.cityBandSize : 0}`;
}

export function buildMetricTimeSeriesCacheKey(options: {
    conflictId: string;
    graphVersion: string | number;
    metric: TierMetric;
    allianceIds?: number[][];
    allianceKey?: string;
    defaultAllianceIds?: number[][];
    aggregationMode?: BubbleAggregationMode;
    cityRange?: CityRange;
}): string {
    const allianceKey =
        options.allianceKey ??
        buildAllianceSelectionKey(options.allianceIds ?? [], {
            defaultAllianceIds: options.defaultAllianceIds,
        });
    const aggregationMode =
        options.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE;
    const cityRange = options.cityRange ?? DEFAULT_CITY_RANGE;

    return `${options.conflictId}:v${String(options.graphVersion)}|metric:${buildMetricKey([options.metric])}|agg:${aggregationMode}|${allianceKey}|${buildCityRangeCacheKey(cityRange)}`;
}
