import { Palette, generateColors, palettePrimary } from "./colors";
import { formatAllianceName } from "./formatting";
import { resolveMetricAccessors } from "./graphMetrics";
import { readGraphTimelineSnapshot } from "./graphTimelineAccess";
import type { TieringDataSet, TieringDataSetResponse } from "./graphDerivedCache";
import type { GraphData, TierMetric } from "./types";

const TURNS_PER_DAY = 12;

type TieringTimeIndex = {
    turnMetricIndex: number;
    dayMetricIndex: number;
    dayValue: number;
};

function resolveTieringTimeIndex(
    turnOrDay: number,
    isAnyTurn: boolean,
    turnStart: number,
    dayStart: number,
): TieringTimeIndex {
    if (isAnyTurn) {
        const dayValue = Math.floor(turnOrDay / TURNS_PER_DAY);
        return {
            turnMetricIndex: turnOrDay - turnStart,
            dayMetricIndex: dayValue - dayStart,
            dayValue,
        };
    }

    return {
        turnMetricIndex: turnOrDay * TURNS_PER_DAY - turnStart,
        dayMetricIndex: turnOrDay - dayStart,
        dayValue: turnOrDay,
    };
}

export function buildCityBandLabels(
    minCity: number,
    maxCity: number,
    cityBandSize: number,
): string[] {
    const cityCount = maxCity - minCity + 1;
    const bandCount = Math.ceil(cityCount / cityBandSize);
    const labels = new Array<string>(bandCount);
    for (let i = 0; i < bandCount; i++) {
        const start = minCity + i * cityBandSize;
        const end = Math.min(start + cityBandSize - 1, maxCity);
        labels[i] = `${start}-${end}`;
    }
    return labels;
}

export function groupRowByCityBand(
    row: number[] | undefined,
    bandCount: number,
    cityBandSize: number,
): number[] {
    const grouped = new Array<number>(bandCount).fill(0);
    if (!row || row.length === 0) return grouped;
    for (let cityOffset = 0; cityOffset < row.length; cityOffset++) {
        grouped[Math.floor(cityOffset / cityBandSize)] += row[cityOffset] || 0;
    }
    return grouped;
}

export function groupRowsByCityBand(
    rows: number[][],
    bandCount: number,
    cityBandSize: number,
): number[][] {
    const groupedRows = new Array<number[]>(rows.length);
    for (let t = 0; t < rows.length; t++) {
        groupedRows[t] = groupRowByCityBand(rows[t], bandCount, cityBandSize);
    }
    return groupedRows;
}

export function getDataSetsByTime(
    data: GraphData,
    metrics: TierMetric[],
    alliance_ids: number[][],
    useSingleColor: boolean,
    cityBandSize: number,
): TieringDataSetResponse | null {
    let minCity = Number.MAX_SAFE_INTEGER;
    let maxCity = 0;
    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        minCity = Math.min(minCity, ...coalition.cities);
        maxCity = Math.max(maxCity, ...coalition.cities);
    }

    let normalizeAny = metrics.reduce((a, b) => a || b.normalize, false);
    let stackByAlliance = !normalizeAny && metrics.length == 1;
    const metricAccessors = resolveMetricAccessors(data, metrics);
    if (!metricAccessors) return null;

    let metric_indexes = metricAccessors.metric_indexes;
    let metric_is_turn = metricAccessors.metric_is_turn;
    let metric_normalize = metricAccessors.metric_normalize;
    let isAnyTurn = metricAccessors.isAnyTurn;
    let len = stackByAlliance
        ? alliance_ids.reduce((sum, ids) => sum + ids.length, 0)
        : data.coalitions.length * metrics.length;
    let allianceSets: Set<number>[] = alliance_ids.map((id) => new Set(id));

    let dataBeforeNormalize: [
        number,
        string,
        string,
        number[][],
        number[][] | null,
    ][] = new Array(len);

    let time_min = isAnyTurn
        ? data.coalitions.reduce(
            (a, b) => Math.min(a, b.turn.range[0]),
            Number.MAX_SAFE_INTEGER,
        )
        : data.coalitions.reduce(
            (a, b) => Math.min(a, b.day.range[0]),
            Number.MAX_SAFE_INTEGER,
        );
    let time_max = isAnyTurn
        ? data.coalitions.reduce((a, b) => Math.max(a, b.turn.range[1]), 0)
        : data.coalitions.reduce((a, b) => Math.max(a, b.day.range[1]), 0);
    let dataSetTimeLen = time_max - time_min + 1;

    let jUsed = 0;
    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        let allowed_alliances = allianceSets[i];

        let turn_start = coalition.turn.range[0];
        let day_start = coalition.day.range[0];
        let col_time_min = isAnyTurn ? turn_start : day_start;
        let col_time_max = isAnyTurn
            ? coalition.turn.range[1]
            : coalition.day.range[1];
        let numAlliances = coalition.alliance_ids.reduce(
            (count, id) => (allowed_alliances.has(id) ? count + 1 : count),
            0,
        );
        let palette: Palette = Object.keys(Palette).map(Number).indexOf(i);
        let colorLen = useSingleColor
            ? 1
            : stackByAlliance
                ? numAlliances
                : metrics.length;
        let colors =
            colorLen > 1
                ? generateColors(colorLen, palette)
                : ["rgb(" + palettePrimary[i] + ")"];
        let colorIndex = 0;
        for (let j = 0; j < coalition.alliance_ids.length; j++) {
            let alliance_id = coalition.alliance_ids[j];
            if (!allowed_alliances.has(alliance_id)) continue;
            let name = formatAllianceName(coalition.alliance_names[j], alliance_id);

            let aaBufferByMetric: number[][] = new Array(metrics.length);
            let denominatorBufferByMetric: number[][] = new Array(metrics.length);
            let last_day = -1;

            for (
                let turnOrDay2 = col_time_min;
                turnOrDay2 <= col_time_max;
                turnOrDay2++
            ) {
                let dataI = turnOrDay2 - time_min;
                const timeIndex = resolveTieringTimeIndex(
                    turnOrDay2,
                    isAnyTurn,
                    turn_start,
                    day_start,
                );

                for (let k = 0; k < metrics.length; k++) {
                    let dataSetIndex = jUsed * metrics.length + k;
                    let is_turn = metric_is_turn[k];
                    if (!is_turn && last_day == timeIndex.dayValue) continue;
                    let metricI = is_turn
                        ? timeIndex.turnMetricIndex
                        : timeIndex.dayMetricIndex;
                    let isCumulative = metrics[k].cumulative;

                    let aaBuffer = aaBufferByMetric[k];
                    if (!aaBuffer) {
                        aaBuffer = aaBufferByMetric[k] = new Array(
                            maxCity - minCity + 1,
                        ).fill(0);
                    }

                    let dataSet = dataBeforeNormalize[dataSetIndex];
                    if (!dataSet) {
                        dataSet = dataBeforeNormalize[dataSetIndex] = [
                            i,
                            (stackByAlliance ? name : coalition.name) +
                            (metrics.length > 1 ? "(" + metrics[k].name + ")" : ""),
                            colors[useSingleColor ? 0 : colorIndex + k],
                            new Array(dataSetTimeLen),
                            normalizeAny ? new Array(dataSetTimeLen) : null,
                        ];
                    }

                    let tierData = dataSet[3][dataI];
                    if (!tierData) {
                        tierData = dataSet[3][dataI] = new Array(
                            maxCity - minCity + 1,
                        ).fill(0);
                    }

                    let denominators: number[] | null = null;
                    if (normalizeAny) {
                        const denominatorsByTime = dataSet[4];
                        if (denominatorsByTime) {
                            denominators = denominatorsByTime[dataI];
                            if (!denominators) {
                                denominators = denominatorsByTime[dataI] = new Array(
                                    maxCity - minCity + 1,
                                ).fill(0);
                            }
                        }
                    }

                    let normalize = metric_normalize[k];
                    if (normalize) {
                        if (!denominators) continue;
                        let denominatorBuffer = denominatorBufferByMetric[k];
                        if (!denominatorBuffer) {
                            denominatorBuffer = denominatorBufferByMetric[k] = new Array(
                                maxCity - minCity + 1,
                            ).fill(0);
                        }
                        let denominatorRow = readGraphTimelineSnapshot({
                            coalition,
                            allianceIndex: j,
                            isTurnMetric: false,
                            metricIndex: normalize.denominatorMetricIndex,
                            timeIndex: timeIndex.dayMetricIndex,
                        });
                        if (denominatorRow) {
                            for (let l = 0; l < denominatorRow.length; l++) {
                                let value = denominatorRow[l];
                                let city = coalition.cities[l];
                                if (value != null) {
                                    denominatorBuffer[city - minCity] = value;
                                }
                            }
                        }
                        if (normalize.mode === "value") {
                            for (let l = 0; l < denominatorBuffer.length; l++) {
                                denominators[l] += denominatorBuffer[l];
                            }
                        } else {
                            for (let l = 0; l < denominatorBuffer.length; l++) {
                                denominators[l] +=
                                    denominatorBuffer[l] *
                                    (l + minCity) *
                                    normalize.unitsPerCity;
                            }
                        }
                    }

                    let metric_index = metric_indexes[k];
                    let value_by_city = readGraphTimelineSnapshot({
                        coalition,
                        allianceIndex: j,
                        isTurnMetric: is_turn,
                        metricIndex: metric_index,
                        timeIndex: metricI,
                    });
                    if (value_by_city && value_by_city.length != 0) {
                        if (isCumulative) {
                            for (let l = 0; l < value_by_city.length; l++) {
                                let value = value_by_city[l];
                                if (value != null) {
                                    let city = coalition.cities[l];
                                    aaBuffer[city - minCity] += value;
                                }
                            }
                        } else {
                            for (let l = 0; l < value_by_city.length; l++) {
                                let value = value_by_city[l];
                                if (value != null) {
                                    let city = coalition.cities[l];
                                    aaBuffer[city - minCity] = value;
                                }
                            }
                        }
                    }

                    for (let l = 0; l < aaBuffer.length; l++) {
                        tierData[l] += aaBuffer[l];
                    }
                }
                last_day = timeIndex.dayValue;
            }

            colorIndex++;
            if (stackByAlliance) {
                jUsed++;
            }
        }
        if (!stackByAlliance) {
            jUsed++;
        }
    }

    const shouldGroupByBand = cityBandSize > 1;
    const cityCount = maxCity - minCity + 1;
    const bandCount = shouldGroupByBand
        ? Math.ceil(cityCount / cityBandSize)
        : cityCount;

    let response: TieringDataSet[] = new Array(len);
    for (let i = 0; i < dataBeforeNormalize.length; i++) {
        let [col, label, color, dataByTime, denominators] = dataBeforeNormalize[i];
        if (shouldGroupByBand) {
            dataByTime = groupRowsByCityBand(dataByTime, bandCount, cityBandSize);
            if (denominators) {
                denominators = groupRowsByCityBand(
                    denominators,
                    bandCount,
                    cityBandSize,
                );
            }
        }
        let normalized: number[][] = new Array(dataByTime.length);
        const zeroRow = new Array(
            shouldGroupByBand ? bandCount : cityCount,
        ).fill(0);
        for (let k = 0; k < dataByTime.length; k++) {
            let dataK = dataByTime[k];
            if (!dataK || dataK.length == 0) {
                dataK = [...zeroRow];
            }
            if (dataK && dataK.length > 0 && denominators) {
                let denominatorK = denominators[k] ?? zeroRow;
                for (let j = 0; j < dataK.length; j++) {
                    let divisor = denominatorK[j];
                    dataK[j] = divisor ? dataK[j] / divisor : 0;
                }
            }
            normalized[k] = dataK;
        }
        response[i] = {
            group: col,
            label,
            color,
            data: normalized,
        };
    }

    return {
        data: response,
        time: [time_min, time_max],
        is_turn: isAnyTurn,
        city_range: [minCity, maxCity],
        city_labels: shouldGroupByBand
            ? buildCityBandLabels(minCity, maxCity, cityBandSize)
            : undefined,
    };
}
