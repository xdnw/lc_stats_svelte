import { formatAllianceName } from "./formatting";
import {
    resolveMetricAccessors,
    type MetricNormalization,
} from "./graphMetrics";
import type { GraphData, TierMetric } from "./types";
import type { TraceBuildResult } from "./graphDerivedCache";
import {
    DEFAULT_BUBBLE_AGGREGATION_MODE,
    type BubbleAggregationMode,
} from "./bubbleAggregation";
import {
    isEmptyCityIndexRange,
    resolveCityIndexRange,
    sumValuesByCityIndexRange,
    type CityIndexRange,
    type CityRange,
} from "./cityRange";
import { readGraphTimelineSnapshot } from "./graphTimelineAccess";

type MetricTuple = [TierMetric, TierMetric, TierMetric];

type MetricKernel = {
    metricIndexes: number[];
    metricIsTurn: boolean[];
    metricNormalize: Array<MetricNormalization | null>;
    isAnyTurn: boolean;
};

type TraceLookup = TraceBuildResult["traces"];

function ensureTrace(
    lookup: TraceLookup,
    time: number,
    coalitionId: number,
): TraceBuildResult["traces"][number][number] {
    let traceByCoalition = lookup[time];
    if (!traceByCoalition) {
        traceByCoalition = {};
        lookup[time] = traceByCoalition;
    }

    let trace = traceByCoalition[coalitionId];
    if (!trace) {
        trace = {
            x: [],
            y: [],
            id: [],
            text: [],
            customdata: [],
            marker: { size: [] },
        };
        traceByCoalition[coalitionId] = trace;
    }

    return trace;
}

function updateRanges(
    ranges: TraceBuildResult["ranges"],
    values: number[],
): void {
    const rangeKeys: (keyof TraceBuildResult["ranges"])[] = ["x", "y", "z"];
    for (let metricIndex = 0; metricIndex < values.length; metricIndex += 1) {
        const key = rangeKeys[metricIndex];
        const value = values[metricIndex] ?? 0;
        if (value < ranges[key][0]) ranges[key][0] = value;
        if (value > ranges[key][1]) ranges[key][1] = value;
    }
}

function sumNormalizedDenominator(
    valuesByCity: number[],
    normalize: MetricNormalization,
    cityRange: CityIndexRange,
    coalition: GraphData["coalitions"][number],
): number {
    let total = 0;
    for (
        let cityIndex = cityRange.min;
        cityIndex <= cityRange.max;
        cityIndex += 1
    ) {
        const value = valuesByCity[cityIndex] ?? 0;
        if (normalize.mode === "perCity") {
            total +=
                value *
                (coalition.cities[cityIndex] ?? 0) *
                normalize.unitsPerCity;
        } else {
            total += value;
        }
    }
    return total;
}

function buildMetricKernel(
    data: GraphData,
    metrics: MetricTuple,
): MetricKernel | null {
    const metricAccessors = resolveMetricAccessors(data, metrics);
    if (!metricAccessors) return null;

    return {
        metricIndexes: metricAccessors.metric_indexes,
        metricIsTurn: metricAccessors.metric_is_turn,
        metricNormalize: metricAccessors.metric_normalize,
        isAnyTurn: metricAccessors.isAnyTurn,
    };
}

function buildEmptyRanges(): TraceBuildResult["ranges"] {
    return {
        x: [0, Number.MIN_SAFE_INTEGER],
        y: [0, Number.MIN_SAFE_INTEGER],
        z: [0, Number.MIN_SAFE_INTEGER],
    };
}

function buildTraceBuildResult(options: {
    traces: TraceLookup;
    ranges: TraceBuildResult["ranges"];
    minTime: number;
    maxTime: number;
    isTurn: boolean;
}): TraceBuildResult {
    return {
        traces: options.traces,
        ranges: options.ranges,
        times: {
            start: options.minTime,
            end: options.maxTime,
            is_turn: options.isTurn,
        },
    };
}

function generateAllianceTraces(options: {
    data: GraphData;
    metrics: MetricTuple;
    kernel: MetricKernel;
    cityRange: CityRange;
    selectedAllianceIds?: Iterable<number> | null;
}): TraceBuildResult {
    const selectedAllianceIdSet = options.selectedAllianceIds
        ? new Set(options.selectedAllianceIds)
        : null;
    const traces: TraceLookup = {};
    const ranges = buildEmptyRanges();
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (let coalitionIndex = 0; coalitionIndex < options.data.coalitions.length; coalitionIndex += 1) {
        const coalition = options.data.coalitions[coalitionIndex];
        const cityRange = resolveCityIndexRange(coalition.cities, options.cityRange);
        const turnStart = coalition.turn.range[0];
        const dayStart = coalition.day.range[0];
        const start = options.kernel.isAnyTurn ? turnStart : dayStart;
        const end = options.kernel.isAnyTurn
            ? coalition.turn.range[1]
            : coalition.day.range[1];

        for (let allianceIndex = 0; allianceIndex < coalition.alliance_ids.length; allianceIndex += 1) {
            const allianceId = coalition.alliance_ids[allianceIndex];
            if (selectedAllianceIdSet && !selectedAllianceIdSet.has(allianceId)) {
                continue;
            }

            const label = formatAllianceName(
                coalition.alliance_names[allianceIndex],
                allianceId,
            );
            const buffer: number[] = [0, 0, 0];
            let lastDay = -1;

            for (let turnOrDay = start; turnOrDay <= end; turnOrDay += 1) {
                if (turnOrDay < minTime) minTime = turnOrDay;
                if (turnOrDay > maxTime) maxTime = turnOrDay;

                const trace = ensureTrace(traces, turnOrDay, coalitionIndex);
                trace.id.push(allianceId);
                trace.text.push(label);

                const turn = options.kernel.isAnyTurn
                    ? turnOrDay
                    : Math.floor(turnOrDay * 12);
                const day = options.kernel.isAnyTurn
                    ? Math.floor(turnOrDay / 12)
                    : turnOrDay;

                for (let metricIndex = 0; metricIndex < options.metrics.length; metricIndex += 1) {
                    const isTurnMetric = options.kernel.metricIsTurn[metricIndex];
                    if (!isTurnMetric && lastDay === day) continue;

                    const dataIndex = options.kernel.metricIndexes[metricIndex];
                    const valuesByCity = readGraphTimelineSnapshot({
                        coalition,
                        allianceIndex,
                        isTurnMetric,
                        metricIndex: dataIndex,
                        timeIndex: isTurnMetric ? turn - turnStart : day - dayStart,
                    });
                    if (!valuesByCity || valuesByCity.length === 0) continue;

                    let total = sumValuesByCityIndexRange(valuesByCity, cityRange);

                    const normalizeConfig = options.kernel.metricNormalize[metricIndex];
                    if (normalizeConfig && !isEmptyCityIndexRange(cityRange)) {
                        const denominatorValues = readGraphTimelineSnapshot({
                            coalition,
                            allianceIndex,
                            isTurnMetric: false,
                            metricIndex: normalizeConfig.denominatorMetricIndex,
                            timeIndex: day - dayStart,
                        });
                        if (!denominatorValues || denominatorValues.length === 0) {
                            continue;
                        }

                        const denominator = sumNormalizedDenominator(
                            denominatorValues,
                            normalizeConfig,
                            cityRange,
                            coalition,
                        );
                        if (denominator !== 0) {
                            total /= denominator;
                        }
                    }

                    if (options.metrics[metricIndex].cumulative) {
                        buffer[metricIndex] += total;
                    } else {
                        buffer[metricIndex] = total;
                    }
                }

                trace.x.push(buffer[0]);
                trace.y.push(buffer[1]);
                trace.customdata.push(buffer[2]);
                updateRanges(ranges, buffer);
                lastDay = day;
            }
        }
    }

    return buildTraceBuildResult({
        traces,
        ranges,
        minTime,
        maxTime,
        isTurn: options.kernel.isAnyTurn,
    });
}

type CoalitionMetricAggregate = {
    numerator: number;
    denominator: number;
};

function generateCoalitionTraces(options: {
    data: GraphData;
    metrics: MetricTuple;
    kernel: MetricKernel;
    cityRange: CityRange;
    selectedAllianceIds?: Iterable<number> | null;
}): TraceBuildResult {
    const selectedAllianceIdSet = options.selectedAllianceIds
        ? new Set(options.selectedAllianceIds)
        : null;
    const traces: TraceLookup = {};
    const ranges = buildEmptyRanges();
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (let coalitionIndex = 0; coalitionIndex < options.data.coalitions.length; coalitionIndex += 1) {
        const coalition = options.data.coalitions[coalitionIndex];
        const cityRange = resolveCityIndexRange(coalition.cities, options.cityRange);
        const turnStart = coalition.turn.range[0];
        const dayStart = coalition.day.range[0];
        const start = options.kernel.isAnyTurn ? turnStart : dayStart;
        const end = options.kernel.isAnyTurn
            ? coalition.turn.range[1]
            : coalition.day.range[1];
        const selectedAllianceIndexes: number[] = [];
        for (let allianceIndex = 0; allianceIndex < coalition.alliance_ids.length; allianceIndex += 1) {
            const allianceId = coalition.alliance_ids[allianceIndex];
            if (selectedAllianceIdSet && !selectedAllianceIdSet.has(allianceId)) {
                continue;
            }
            selectedAllianceIndexes.push(allianceIndex);
        }
        if (selectedAllianceIndexes.length === 0) {
            continue;
        }

        const seriesId = -(coalitionIndex + 1);
        const seriesLabel = coalition.name?.trim() || `Coalition ${coalitionIndex + 1}`;
        const buffer: number[] = [0, 0, 0];
        const dayAggregateCacheByMetric: Array<Map<number, CoalitionMetricAggregate>> =
            options.metrics.map(() => new Map<number, CoalitionMetricAggregate>());

        for (let turnOrDay = start; turnOrDay <= end; turnOrDay += 1) {
            if (turnOrDay < minTime) minTime = turnOrDay;
            if (turnOrDay > maxTime) maxTime = turnOrDay;

            const turn = options.kernel.isAnyTurn
                ? turnOrDay
                : Math.floor(turnOrDay * 12);
            const day = options.kernel.isAnyTurn
                ? Math.floor(turnOrDay / 12)
                : turnOrDay;
            const metricValues = [0, 0, 0];

            for (let metricIndex = 0; metricIndex < options.metrics.length; metricIndex += 1) {
                const isTurnMetric = options.kernel.metricIsTurn[metricIndex];
                const normalizeConfig = options.kernel.metricNormalize[metricIndex];
                const metricCache = dayAggregateCacheByMetric[metricIndex];
                let aggregate: CoalitionMetricAggregate | null = null;

                if (options.kernel.isAnyTurn && !isTurnMetric) {
                    aggregate = metricCache.get(day) ?? null;
                }

                if (!aggregate) {
                    const dataIndex = options.kernel.metricIndexes[metricIndex];
                    let numerator = 0;
                    let denominator = 0;

                    for (const allianceIndex of selectedAllianceIndexes) {
                        const valuesByCity = readGraphTimelineSnapshot({
                            coalition,
                            allianceIndex,
                            isTurnMetric,
                            metricIndex: dataIndex,
                            timeIndex: isTurnMetric ? turn - turnStart : day - dayStart,
                        });
                        if (!valuesByCity || valuesByCity.length === 0) continue;

                        numerator += sumValuesByCityIndexRange(
                            valuesByCity,
                            cityRange,
                        );

                        if (normalizeConfig) {
                            if (!isEmptyCityIndexRange(cityRange)) {
                                const denominatorValues = readGraphTimelineSnapshot({
                                    coalition,
                                    allianceIndex,
                                    isTurnMetric: false,
                                    metricIndex: normalizeConfig.denominatorMetricIndex,
                                    timeIndex: day - dayStart,
                                });
                                if (!denominatorValues || denominatorValues.length === 0) continue;

                                denominator += sumNormalizedDenominator(
                                    denominatorValues,
                                    normalizeConfig,
                                    cityRange,
                                    coalition,
                                );
                            }
                        }
                    }

                    aggregate = {
                        numerator,
                        denominator,
                    };
                    if (options.kernel.isAnyTurn && !isTurnMetric) {
                        metricCache.set(day, aggregate);
                    }
                }

                let metricValue = aggregate.numerator;
                if (normalizeConfig && aggregate.denominator !== 0) {
                    metricValue /= aggregate.denominator;
                }

                metricValues[metricIndex] = metricValue;
            }

            for (let metricIndex = 0; metricIndex < options.metrics.length; metricIndex += 1) {
                if (options.metrics[metricIndex].cumulative) {
                    buffer[metricIndex] += metricValues[metricIndex];
                } else {
                    buffer[metricIndex] = metricValues[metricIndex];
                }
            }

            const trace = ensureTrace(traces, turnOrDay, coalitionIndex);
            trace.id.push(seriesId);
            trace.text.push(seriesLabel);
            trace.x.push(buffer[0]);
            trace.y.push(buffer[1]);
            trace.customdata.push(buffer[2]);
            updateRanges(ranges, buffer);
        }
    }

    return buildTraceBuildResult({
        traces,
        ranges,
        minTime,
        maxTime,
        isTurn: options.kernel.isAnyTurn,
    });
}

export function generateTraces(
    data: GraphData,
    x_axis: TierMetric,
    y_axis: TierMetric,
    size: TierMetric,
    cityRange: CityRange,
    selectedAllianceIds?: Iterable<number> | null,
    aggregationMode: BubbleAggregationMode = DEFAULT_BUBBLE_AGGREGATION_MODE,
): TraceBuildResult | null {
    const metrics: MetricTuple = [x_axis, y_axis, size];
    const kernel = buildMetricKernel(data, metrics);
    if (!kernel) return null;

    if (aggregationMode === "coalition") {
        return generateCoalitionTraces({
            data,
            metrics,
            kernel,
            cityRange,
            selectedAllianceIds,
        });
    }

    return generateAllianceTraces({
        data,
        metrics,
        kernel,
        cityRange,
        selectedAllianceIds,
    });
}
