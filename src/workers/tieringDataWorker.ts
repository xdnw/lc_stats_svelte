import * as d3 from "d3";
import { formatAllianceName } from "../lib/formatting";
import { Palette, generateColors, palettePrimary } from "../lib/colors";
import { resolveMetricAccessors } from "../lib/graphMetrics";
import type { GraphData, TierMetric } from "../lib/types";

type DataSet = {
    group: number;
    label: string;
    color: string;
    data: number[][];
};

type DataSetResponse = {
    data: DataSet[];
    city_range: [number, number];
    time: [number, number];
    is_turn: boolean;
};

type WorkerRequest = {
    id: number;
    data: GraphData;
    metrics: TierMetric[];
    alliance_ids: number[][];
    useSingleColor: boolean;
};

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result: DataSetResponse | null;
};

type WorkerErrorResponse = {
    id: number;
    ok: false;
    error: string;
};

function getDataSetsByTime(
    data: GraphData,
    metrics: TierMetric[],
    alliance_ids: number[][],
    useSingleColor: boolean,
): DataSetResponse | null {
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
    let len =
        metrics.length == 1
            ? alliance_ids.length
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
                ? generateColors(d3, colorLen, palette)
                : ["rgb(" + palettePrimary[i] + ")"];
        let colorIndex = 0;
        for (let j = 0; j < coalition.alliance_ids.length; j++) {
            let alliance_id = coalition.alliance_ids[j];
            if (!allowed_alliances.has(alliance_id)) continue;
            let name = formatAllianceName(
                coalition.alliance_names[j],
                alliance_id,
            );

            let aaBufferByMetric: number[][] = new Array(metrics.length);
            let countsBuffer: number[] = new Array(maxCity - minCity + 1).fill(0);
            let last_day = -1;

            for (
                let turnOrDay2 = col_time_min;
                turnOrDay2 <= col_time_max;
                turnOrDay2++
            ) {
                let dataI = turnOrDay2 - time_min;
                let dataColI = turnOrDay2 - col_time_min;
                let turnI = isAnyTurn ? dataColI : dataColI * 12;
                let dayI = isAnyTurn ? Math.floor(dataColI / 12) : dataColI;

                for (let k = 0; k < metrics.length; k++) {
                    let dataSetIndex = jUsed * metrics.length + k;
                    let is_turn = metric_is_turn[k];
                    if (!is_turn && last_day == dayI) continue;
                    let metricI = is_turn ? turnI : dayI;
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
                            (metrics.length > 1
                                ? "(" + metrics[k].name + ")"
                                : ""),
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
                    let counts: number[] | null = null;
                    if (normalizeAny) {
                        const countsByTime = dataSet[4];
                        if (countsByTime) {
                            counts = countsByTime[dataI];
                            if (!counts) {
                                counts = countsByTime[dataI] = new Array(
                                    maxCity - minCity + 1,
                                ).fill(0);
                            }
                        }
                    }
                    let normalize = metric_normalize[k];
                    if (normalize != -1) {
                        if (!counts) {
                            continue;
                        }
                        let nation_counts_by_day = coalition.day.data[0][j];
                        if (!nation_counts_by_day) {
                            continue;
                        }
                        let nation_counts = nation_counts_by_day[dayI];
                        if (nation_counts) {
                            for (let l = 0; l < nation_counts.length; l++) {
                                let value = nation_counts[l];
                                let city = coalition.cities[l];
                                if (value != null) {
                                    countsBuffer[city - minCity] = value;
                                }
                            }
                        }
                        if (normalize == 0) {
                            for (let l = 0; l < countsBuffer.length; l++) {
                                let city = coalition.cities[l];
                                let value = countsBuffer[l];
                                if (value != null) {
                                    counts[city - minCity] += value;
                                }
                            }
                        } else {
                            for (let l = 0; l < countsBuffer.length; l++) {
                                let city = coalition.cities[l];
                                let value = countsBuffer[l];
                                if (value != null) {
                                    counts[city - minCity] += value * city * normalize;
                                }
                            }
                        }
                    }

                    let metric_index = metric_indexes[k];
                    let value_by_time = is_turn
                        ? coalition.turn.data[metric_index][j]
                        : coalition.day.data[metric_index][j];
                    if (value_by_time && value_by_time.length != 0) {
                        let value_by_city = value_by_time[metricI];
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
                    }
                    for (let l = 0; l < aaBuffer.length; l++) {
                        tierData[l] += aaBuffer[l];
                    }
                }
                last_day = dayI;
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

    let response: DataSet[] = new Array(len);
    for (let i = 0; i < dataBeforeNormalize.length; i++) {
        let [col, label, color, dataByTime, counts] = dataBeforeNormalize[i];
        let normalized: number[][] = new Array(dataByTime.length);
        let dataPrev: number[] | null = null;
        for (let k = 0; k < dataByTime.length; k++) {
            let dataK = dataByTime[k];
            if (!dataK || dataK.length == 0) {
                if (dataPrev) {
                    dataK = dataPrev;
                }
            }
            dataPrev = dataK;
            if (dataK && dataK.length > 0 && counts) {
                let countsK = counts[k];
                for (let j = 0; j < dataK.length; j++) {
                    let divisor = countsK[j];
                    dataK[j] = divisor ? dataK[j] / divisor : 0;
                }
            }
            normalized[k] = dataK;
        }
        response[i] = {
            group: col,
            label: label,
            color: color,
            data: normalized,
        };
    }
    return {
        data: response,
        time: [time_min, time_max],
        is_turn: isAnyTurn,
        city_range: [minCity, maxCity],
    };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, data, metrics, alliance_ids, useSingleColor } = event.data;
    try {
        const result = getDataSetsByTime(
            data,
            metrics,
            alliance_ids,
            useSingleColor,
        );
        const response: WorkerSuccessResponse = { id, ok: true, result };
        self.postMessage(response);
    } catch (error) {
        const response: WorkerErrorResponse = {
            id,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown worker error",
        };
        self.postMessage(response);
    }
};
