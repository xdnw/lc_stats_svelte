import { formatAllianceName } from "../lib/formatting";
import { resolveMetricAccessors } from "../lib/graphMetrics";
import type { GraphData, TierMetric } from "../lib/types";

type Trace = {
    x: number[];
    y: number[];
    customdata: number[];
    id: number[];
    text: string[];
    marker: { size: number[] };
};

type Range = {
    x: number[];
    y: number[];
    z: number[];
};

type Timeframe = {
    start: number;
    end: number;
    is_turn: boolean;
};

type TraceBuildResult = {
    traces: { [key: number]: { [key: number]: Trace } };
    times: Timeframe;
    ranges: Range;
};

type WorkerRequest = {
    id: number;
    data: GraphData;
    metrics: [TierMetric, TierMetric, TierMetric];
    minCity: number;
    maxCity: number;
};

type WorkerSuccessResponse = {
    id: number;
    ok: true;
    result: TraceBuildResult | null;
};

type WorkerErrorResponse = {
    id: number;
    ok: false;
    error: string;
};

function generateTraces(
    data: GraphData,
    x_axis: TierMetric,
    y_axis: TierMetric,
    size: TierMetric,
    min_city: number,
    max_city: number,
): TraceBuildResult | null {
    let ranges: Range = {
        x: [0, Number.MIN_SAFE_INTEGER],
        y: [0, Number.MIN_SAFE_INTEGER],
        z: [0, Number.MIN_SAFE_INTEGER],
    };
    const rangesKeys: (keyof typeof ranges)[] = ['x', 'y', 'z'];

    let metrics = [x_axis, y_axis, size];
    const metricAccessors = resolveMetricAccessors(data, metrics);
    if (!metricAccessors) return null;
    let metric_indexes = metricAccessors.metric_indexes;
    let metric_is_turn = metricAccessors.metric_is_turn;
    let metric_normalize = metricAccessors.metric_normalize;
    let isAnyTurn = metricAccessors.isAnyTurn;
    let lookup: { [key: number]: { [key: number]: Trace } } = {};
    let lookupMin = Infinity;
    let lookupMax = -Infinity;

    for (let i = 0; i < data.coalitions.length; i++) {
        let coalition = data.coalitions[i];
        let minCityIndex = coalition.cities.findIndex((city) => city >= min_city);
        let maxCityIndex = coalition.cities
            .slice()
            .reverse()
            .findIndex((city) => city <= max_city);
        if (maxCityIndex !== -1)
            maxCityIndex = coalition.cities.length - 1 - maxCityIndex;
        if (minCityIndex == -1) minCityIndex = 0;
        if (maxCityIndex == -1) maxCityIndex = coalition.cities.length;

        let turn_start = coalition.turn.range[0];
        let day_start = coalition.day.range[0];
        let start = isAnyTurn ? turn_start : day_start;
        let end = isAnyTurn ? coalition.turn.range[1] : coalition.day.range[1];

        for (let j = 0; j < coalition.alliance_ids.length; j++) {
            let alliance_id = coalition.alliance_ids[j];
            let name = formatAllianceName(coalition.alliance_names[j], alliance_id);

            let buffer: number[] = [0, 0, 0];
            let lastDay = -1;
            for (let turnOrDay = start; turnOrDay <= end; turnOrDay++) {
                if (turnOrDay < lookupMin) lookupMin = turnOrDay;
                if (turnOrDay > lookupMax) lookupMax = turnOrDay;
                let traceByCol = lookup[turnOrDay];
                if (!traceByCol) {
                    traceByCol = {};
                    lookup[turnOrDay] = traceByCol;
                }
                let trace = traceByCol[i];
                if (!trace) {
                    trace = {
                        x: [],
                        y: [],
                        id: [],
                        text: [],
                        customdata: [],
                        marker: { size: [] },
                    };
                    traceByCol[i] = trace;
                }
                trace.id.push(alliance_id);
                trace.text.push(name);

                let turn = isAnyTurn ? turnOrDay : Math.floor(turnOrDay * 12);
                let day = isAnyTurn ? Math.floor(turnOrDay / 12) : turnOrDay;
                for (let k = 0; k < metrics.length; k++) {
                    let is_turn = metric_is_turn[k];
                    if (!is_turn && lastDay == day) continue;
                    let isCumulative = metrics[k].cumulative;

                    let metric_index = metric_indexes[k];

                    let value_by_day = is_turn
                        ? coalition.turn.data[metric_index][j]
                        : coalition.day.data[metric_index][j];
                    if (!value_by_day) {
                        continue;
                    }
                    let value_by_city =
                        value_by_day[is_turn ? turn - turn_start : day - day_start];
                    if (!value_by_city || value_by_city.length == 0) {
                        continue;
                    }
                    let total = 0.0;
                    for (let l = minCityIndex; l <= maxCityIndex; l++) {
                        total += value_by_city[l];
                    }
                    let normalize = metric_normalize[k];
                    if (normalize != -1) {
                        let nations = 0.0;
                        let nation_counts_by_day = coalition.day.data[0][j];
                        if (!nation_counts_by_day) continue;
                        let nation_counts = nation_counts_by_day[day - day_start];
                        if (!nation_counts || nation_counts.length == 0) continue;
                        if (normalize == 0) {
                            for (let l = minCityIndex; l <= maxCityIndex; l++) {
                                nations += nation_counts[l];
                            }
                        } else {
                            for (let l = minCityIndex; l <= maxCityIndex; l++) {
                                let cities = coalition.cities[l];
                                nations += nation_counts[l] * cities * normalize;
                            }
                        }
                        if (nations != 0) {
                            total /= nations;
                        }
                    }
                    if (isCumulative) {
                        buffer[k] += total;
                    } else {
                        buffer[k] = total;
                    }
                }
                trace.x.push(buffer[0]);
                trace.y.push(buffer[1]);
                trace.customdata.push(buffer[2]);

                for (let k = 0; k < 3; k++) {
                    let ri = rangesKeys[k];
                    if (buffer[k] < ranges[ri][0]) ranges[ri][0] = buffer[k];
                    if (buffer[k] > ranges[ri][1]) ranges[ri][1] = buffer[k];
                }

                lastDay = day;
            }
        }
    }
    let start = lookupMin;
    let end = lookupMax;
    let times: Timeframe = { start: start, end: end, is_turn: isAnyTurn };
    return { traces: lookup, times, ranges };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, data, metrics, minCity, maxCity } = event.data;
    try {
        const result = generateTraces(
            data,
            metrics[0],
            metrics[1],
            metrics[2],
            minCity,
            maxCity,
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
