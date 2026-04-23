import { generateColors, Palette, palettePrimary } from "./colors";
import { formatAllianceName } from "./formatting";
import {
    resolveMetricAccessors,
    type MetricNormalization,
} from "./graphMetrics";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "./bubbleAggregation";
import {
    DEFAULT_CITY_RANGE,
    isEmptyCityIndexRange,
    resolveCityIndexRange,
    sumValuesByCityIndexRange,
    type CityIndexRange,
    type CityRange,
} from "./cityRange";
import { readGraphTimelineSnapshot } from "./graphTimelineAccess";
import type { GraphData, TierMetric } from "./types";

export type MetricTimeSeriesEntry = {
    key: string;
    label: string;
    color: string;
    coalitionIndex: 0 | 1;
    allianceId?: number;
    start: number;
    end: number;
    values: number[];
};

export type MetricTimeSeriesResult = {
    metric: TierMetric;
    isTurn: boolean;
    timeRange: [number, number];
    yDomain: [number, number];
    series: MetricTimeSeriesEntry[];
};

type MetricSeriesSnapshot = {
    start: number;
    end: number;
    values: number[];
};

type MetricAccumulator = {
    numerator: number;
    denominator: number;
    hasValue: boolean;
};

function resolvePalette(coalitionIndex: number): Palette {
    switch (coalitionIndex) {
        case 0:
            return Palette.REDS;
        case 1:
            return Palette.BLUES;
        default:
            return Palette.NEUTRALS;
    }
}

function fallbackColor(index: number): string {
    return `rgb(${palettePrimary[index % palettePrimary.length]})`;
}

function normalizeSelectedAllianceIds(
    selectedAllianceIds?: Iterable<number> | null,
): Set<number> | null {
    if (!selectedAllianceIds) return null;

    const ids = Array.from(
        new Set(
            Array.from(selectedAllianceIds)
                .map((id) => Math.trunc(Number(id)))
                .filter((id) => Number.isFinite(id) && id > 0),
        ),
    );

    return ids.length > 0 ? new Set(ids) : null;
}

function createValueArray(length: number): number[] {
    return Array.from({ length }, () => Number.NaN);
}

function createSnapshot(
    start: number,
    end: number,
): MetricSeriesSnapshot {
    return {
        start,
        end,
        values: createValueArray(end - start + 1),
    };
}

function sumNormalizedDenominatorInRange(
    valuesByCity: number[],
    normalizeMode: MetricNormalization,
    coalition: GraphData["coalitions"][number],
    cityRange: CityIndexRange,
): number {
    if (normalizeMode.mode === "value") {
        return sumValuesByCityIndexRange(valuesByCity, cityRange);
    }

    let denominator = 0;
    for (
        let cityIndex = cityRange.min;
        cityIndex <= cityRange.max;
        cityIndex += 1
    ) {
        const cityCount = coalition.cities[cityIndex] ?? 0;
        denominator +=
            (valuesByCity[cityIndex] ?? 0) *
            cityCount *
            normalizeMode.unitsPerCity;
    }
    return denominator;
}

function readAllianceMetricValue(options: {
    coalition: GraphData["coalitions"][number];
    allianceIndex: number;
    time: number;
    isTurnMetric: boolean;
    metricIndex: number;
    normalizeMode: MetricNormalization | null;
    cityRange: CityIndexRange;
}): MetricAccumulator {
    const {
        coalition,
        allianceIndex,
        time,
        isTurnMetric,
        metricIndex,
        normalizeMode,
        cityRange,
    } = options;
    const rangeStart = isTurnMetric ? coalition.turn.range[0] : coalition.day.range[0];
    const timeIndex = time - rangeStart;
    if (timeIndex < 0) {
        return {
            numerator: 0,
            denominator: 0,
            hasValue: false,
        };
    }

    const valuesByCity = readGraphTimelineSnapshot({
        coalition,
        allianceIndex,
        isTurnMetric,
        metricIndex,
        timeIndex,
    });
    if (!valuesByCity || valuesByCity.length === 0) {
        return {
            numerator: 0,
            denominator: 0,
            hasValue: false,
        };
    }

    const numerator = sumValuesByCityIndexRange(valuesByCity, cityRange);
    if (!normalizeMode) {
        return {
            numerator,
            denominator: 0,
            hasValue: true,
        };
    }
    if (isEmptyCityIndexRange(cityRange)) {
        return {
            numerator,
            denominator: 0,
            hasValue: true,
        };
    }

    const day = isTurnMetric ? Math.floor(time / 12) : time;
    const dayIndex = day - coalition.day.range[0];
    if (dayIndex < 0) {
        return {
            numerator: 0,
            denominator: 0,
            hasValue: false,
        };
    }

    const denominatorValues = readGraphTimelineSnapshot({
        coalition,
        allianceIndex,
        isTurnMetric: false,
        metricIndex: normalizeMode.denominatorMetricIndex,
        timeIndex: dayIndex,
    });
    if (!denominatorValues || denominatorValues.length === 0) {
        return {
            numerator: 0,
            denominator: 0,
            hasValue: false,
        };
    }

    return {
        numerator,
        denominator: sumNormalizedDenominatorInRange(
            denominatorValues,
            normalizeMode,
            coalition,
            cityRange,
        ),
        hasValue: true,
    };
}

function finalizeMetricValue(
    aggregate: MetricAccumulator,
    normalizeMode: MetricNormalization | null,
): number {
    if (!aggregate.hasValue) {
        return Number.NaN;
    }

    if (!normalizeMode) {
        return aggregate.numerator;
    }

    if (aggregate.numerator === 0 && aggregate.denominator === 0) {
        return 0;
    }

    return aggregate.denominator !== 0
        ? aggregate.numerator / aggregate.denominator
        : Number.NaN;
}

function buildAllianceSeriesSnapshot(options: {
    coalition: GraphData["coalitions"][number];
    allianceIndex: number;
    metricIndex: number;
    isTurnMetric: boolean;
    normalizeMode: MetricNormalization | null;
    cumulative: boolean;
    cityRange: CityIndexRange;
}): MetricSeriesSnapshot {
    const {
        coalition,
        allianceIndex,
        metricIndex,
        isTurnMetric,
        normalizeMode,
        cumulative,
        cityRange,
    } = options;
    const range = isTurnMetric ? coalition.turn.range : coalition.day.range;
    const snapshot = createSnapshot(range[0], range[1]);
    let runningTotal = 0;

    for (let time = range[0]; time <= range[1]; time += 1) {
        const aggregate = readAllianceMetricValue({
            coalition,
            allianceIndex,
            time,
            isTurnMetric,
            metricIndex,
            normalizeMode,
            cityRange,
        });
        const value = finalizeMetricValue(aggregate, normalizeMode);
        if (!Number.isFinite(value)) {
            continue;
        }

        const finalValue = cumulative ? (runningTotal += value) : value;
        snapshot.values[time - range[0]] = finalValue;
    }

    return snapshot;
}

function buildCoalitionSeriesSnapshot(options: {
    coalition: GraphData["coalitions"][number];
    selectedAllianceIndexes: number[];
    metricIndex: number;
    isTurnMetric: boolean;
    normalizeMode: MetricNormalization | null;
    cumulative: boolean;
    cityRange: CityIndexRange;
}): MetricSeriesSnapshot {
    const {
        coalition,
        selectedAllianceIndexes,
        metricIndex,
        isTurnMetric,
        normalizeMode,
        cumulative,
        cityRange,
    } = options;
    const range = isTurnMetric ? coalition.turn.range : coalition.day.range;
    const snapshot = createSnapshot(range[0], range[1]);
    let runningTotal = 0;

    for (let time = range[0]; time <= range[1]; time += 1) {
        let numerator = 0;
        let denominator = 0;
        let hasValue = false;

        for (const allianceIndex of selectedAllianceIndexes) {
            const aggregate = readAllianceMetricValue({
                coalition,
                allianceIndex,
                time,
                isTurnMetric,
                metricIndex,
                normalizeMode,
                cityRange,
            });
            if (!aggregate.hasValue) continue;
            numerator += aggregate.numerator;
            denominator += aggregate.denominator;
            hasValue = true;
        }

        const value = finalizeMetricValue(
            {
                numerator,
                denominator,
                hasValue,
            },
            normalizeMode,
        );
        if (!Number.isFinite(value)) {
            continue;
        }

        const finalValue = cumulative ? (runningTotal += value) : value;
        snapshot.values[time - range[0]] = finalValue;
    }

    return snapshot;
}

function alignSeriesValues(options: {
    source: MetricSeriesSnapshot;
    timeRange: [number, number];
    cumulative: boolean;
}): number[] {
    const [start, end] = options.timeRange;
    const values = createValueArray(end - start + 1);

    for (let time = options.source.start; time <= options.source.end; time += 1) {
        values[time - start] = options.source.values[time - options.source.start] ?? Number.NaN;
    }

    let trailingValue = 0;
    if (options.cumulative) {
        for (let index = options.source.values.length - 1; index >= 0; index -= 1) {
            const value = options.source.values[index];
            if (Number.isFinite(value)) {
                trailingValue = value;
                break;
            }
        }
    }

    for (let time = options.source.end + 1; time <= end; time += 1) {
        values[time - start] = options.cumulative ? trailingValue : 0;
    }

    return values;
}

function computeYDomain(series: MetricTimeSeriesEntry[]): [number, number] {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (const entry of series) {
        for (const value of entry.values) {
            if (!Number.isFinite(value)) continue;
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
        }
    }

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return [0, 0];
    }

    return [minValue, maxValue];
}

export function buildMetricTimeSeries(options: {
    data: GraphData;
    metric: TierMetric;
    selectedAllianceIds?: Iterable<number> | null;
    aggregationMode?: BubbleAggregationMode;
    cityRange?: CityRange;
}): MetricTimeSeriesResult | null {
    const metricAccessors = resolveMetricAccessors(options.data, [options.metric]);
    if (!metricAccessors) {
        return null;
    }

    const metricIndex = metricAccessors.metric_indexes[0] ?? -1;
    const isTurnMetric = metricAccessors.metric_is_turn[0] ?? false;
    const normalizeMode = metricAccessors.metric_normalize[0] ?? null;
    if (metricIndex < 0) {
        return null;
    }

    const aggregationMode = options.aggregationMode ?? DEFAULT_BUBBLE_AGGREGATION_MODE;
    const cityRange = options.cityRange ?? DEFAULT_CITY_RANGE;
    const selectedAllianceIdSet = normalizeSelectedAllianceIds(options.selectedAllianceIds);
    const timeRange: [number, number] = [
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
    ];
    const series: MetricTimeSeriesEntry[] = [];

    for (let coalitionIndex = 0; coalitionIndex < options.data.coalitions.length; coalitionIndex += 1) {
        const coalition = options.data.coalitions[coalitionIndex];
        const cityIndexRange = resolveCityIndexRange(coalition.cities, cityRange);
        const selectedAllianceIndexes = coalition.alliance_ids.reduce<number[]>(
            (indexes, allianceId, allianceIndex) => {
                if (!selectedAllianceIdSet || selectedAllianceIdSet.has(allianceId)) {
                    indexes.push(allianceIndex);
                }
                return indexes;
            },
            [],
        );
        if (selectedAllianceIndexes.length === 0) {
            continue;
        }

        if (aggregationMode === "coalition") {
            const snapshot = buildCoalitionSeriesSnapshot({
                coalition,
                selectedAllianceIndexes,
                metricIndex,
                isTurnMetric,
                normalizeMode,
                cumulative: options.metric.cumulative,
                cityRange: cityIndexRange,
            });
            timeRange[0] = Math.min(timeRange[0], snapshot.start);
            timeRange[1] = Math.max(timeRange[1], snapshot.end);
            series.push({
                key: `coalition:${coalitionIndex}`,
                label: coalition.name?.trim() || `Coalition ${coalitionIndex + 1}`,
                color: generateColors(1, resolvePalette(coalitionIndex))[0] ?? fallbackColor(coalitionIndex),
                coalitionIndex: coalitionIndex as 0 | 1,
                start: snapshot.start,
                end: snapshot.end,
                values: snapshot.values,
            });
            continue;
        }

        const colors = generateColors(
            Math.max(selectedAllianceIndexes.length, 1),
            resolvePalette(coalitionIndex),
        );
        for (let index = 0; index < selectedAllianceIndexes.length; index += 1) {
            const allianceIndex = selectedAllianceIndexes[index]!;
            const allianceId = coalition.alliance_ids[allianceIndex]!;
            const snapshot = buildAllianceSeriesSnapshot({
                coalition,
                allianceIndex,
                metricIndex,
                isTurnMetric,
                normalizeMode,
                cumulative: options.metric.cumulative,
                cityRange: cityIndexRange,
            });
            timeRange[0] = Math.min(timeRange[0], snapshot.start);
            timeRange[1] = Math.max(timeRange[1], snapshot.end);
            series.push({
                key: `alliance:${coalitionIndex}:${allianceId}`,
                label: formatAllianceName(
                    coalition.alliance_names[allianceIndex],
                    allianceId,
                ),
                color: colors[index] ?? fallbackColor(coalitionIndex + index),
                coalitionIndex: coalitionIndex as 0 | 1,
                allianceId,
                start: snapshot.start,
                end: snapshot.end,
                values: snapshot.values,
            });
        }
    }

    if (!Number.isFinite(timeRange[0]) || !Number.isFinite(timeRange[1]) || series.length === 0) {
        return null;
    }

    const alignedSeries = series.map((entry) => ({
        ...entry,
        values: alignSeriesValues({
            source: {
                start: entry.start,
                end: entry.end,
                values: entry.values,
            },
            timeRange,
            cumulative: options.metric.cumulative,
        }),
    }));

    return {
        metric: { ...options.metric },
        isTurn: isTurnMetric,
        timeRange,
        yDomain: computeYDomain(alignedSeries),
        series: alignedSeries,
    };
}
