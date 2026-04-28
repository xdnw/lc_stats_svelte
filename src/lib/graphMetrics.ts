import type { GraphData, TierMetric } from './types';

export const UNITS_PER_CITY: { [key: string]: number } = {
    soldier: 15_000,
    tank: 1250,
    aircraft: 75,
    ship: 15,
    infra: 1,
};

const UNIT_CAPACITY_METRICS: { [key: string]: string } = {
    soldier: "soldier_capacity",
    tank: "tank_capacity",
    aircraft: "aircraft_capacity",
    ship: "ship_capacity",
};

const NATION_METRIC_NAME = "nation";

export type MetricNormalization =
    | {
          denominatorMetricIndex: number;
          mode: "value";
      }
    | {
          denominatorMetricIndex: number;
          mode: "perCity";
          unitsPerCity: number;
      };

export type MetricAccessors = {
    metric_ids: number[];
    metric_indexes: number[];
    metric_is_turn: boolean[];
    metric_is_event: boolean[];
    metric_normalize: Array<MetricNormalization | null>;
    isAnyTurn: boolean;
};

const EVENT_METRIC_NAME_PREFIXES = ["loss:", "dealt:", "def:", "off:"];

function isEventMetricName(name: string): boolean {
    for (let i = 0; i < EVENT_METRIC_NAME_PREFIXES.length; i += 1) {
        if (name.startsWith(EVENT_METRIC_NAME_PREFIXES[i]!)) return true;
    }
    return false;
}

function isEventMetricId(data: GraphData, metricId: number): boolean {
    if (data.metrics_event && data.metrics_event.includes(metricId)) {
        return true;
    }
    const name = data.metric_names[metricId];
    return name != null && isEventMetricName(name);
}

function findDayMetricIndex(data: GraphData, metricName: string): number {
    const metricId = data.metric_names.indexOf(metricName);
    if (metricId === -1) {
        return -1;
    }

    return data.metrics_day.indexOf(metricId);
}

export function toggleCoalitionAllianceSelection(
    allowedAllianceIds: Set<number>,
    coalitions: { alliance_ids: number[] }[],
    coalitionIndex: number,
    allianceId: number,
): Set<number> {
    const coalition = coalitions[coalitionIndex];
    const hasAll = coalition?.alliance_ids.every((id) => allowedAllianceIds.has(id));
    const countCoalition = coalition?.alliance_ids.filter((id) => allowedAllianceIds.has(id)).length ?? 0;
    const hasAA = allowedAllianceIds.has(allianceId);
    const otherCoalitionId = coalitionIndex === 0 ? 1 : 0;
    const otherCoalition = coalitions[otherCoalitionId];
    const otherHasAll = otherCoalition?.alliance_ids.every((id) => allowedAllianceIds.has(id));

    if (hasAA) {
        if (hasAll && otherHasAll) {
            return new Set([
                ...(otherCoalition?.alliance_ids ?? []),
                allianceId,
            ]);
        }
        if (countCoalition === 1) {
            return new Set([
                ...allowedAllianceIds,
                ...(coalition?.alliance_ids ?? []),
            ]);
        }
        return new Set([...allowedAllianceIds].filter((id) => id !== allianceId));
    }

    return new Set([...allowedAllianceIds, allianceId]);
}

export function resolveMetricAccessors(
    data: GraphData,
    metrics: TierMetric[],
): MetricAccessors | null {
    let metric_ids: number[] = [];
    let metric_indexes: number[] = [];
    let metric_is_turn: boolean[] = [];
    let metric_is_event: boolean[] = [];
    let metric_normalize: Array<MetricNormalization | null> = [];
    const nationMetricIndex = findDayMetricIndex(data, NATION_METRIC_NAME);
    if (nationMetricIndex === -1) {
        console.error(`Metric ${NATION_METRIC_NAME} not found`);
        return null;
    }

    for (let i = 0; i < metrics.length; i++) {
        let metric = metrics[i];
        let metric_id = data.metric_names.indexOf(metric.name);
        if (metric_id == -1) {
            console.error(`Metric ${metric.name} not found`);
            return null;
        }
        metric_ids.push(metric_id);
        let is_turn = data.metrics_turn.includes(metric_id);
        metric_is_turn.push(is_turn);
        metric_is_event.push(isEventMetricId(data, metric_id));
        metric_indexes.push(
            is_turn
                ? data.metrics_turn.indexOf(metric_id)
                : data.metrics_day.indexOf(metric_id),
        );
        if (metric_indexes[i] == -1) {
            console.error(`Metric ${metric.name} not found ${metric_id}`);
            return null;
        }
        if (metric.normalize) {
            const capacityMetricName = UNIT_CAPACITY_METRICS[metric.name];
            const capacityMetricIndex = capacityMetricName
                ? findDayMetricIndex(data, capacityMetricName)
                : -1;
            if (capacityMetricIndex !== -1) {
                metric_normalize.push({
                    denominatorMetricIndex: capacityMetricIndex,
                    mode: "value",
                });
                continue;
            }

            const perCity = UNITS_PER_CITY[metric.name];
            if (perCity != null) {
                metric_normalize.push({
                    denominatorMetricIndex: nationMetricIndex,
                    mode: "perCity",
                    unitsPerCity: perCity,
                });
            } else {
                metric_normalize.push({
                    denominatorMetricIndex: nationMetricIndex,
                    mode: "value",
                });
            }
        } else {
            metric_normalize.push(null);
        }
    }

    let isAnyTurn = metric_is_turn.reduce((a, b) => a || b, false);
    return {
        metric_ids,
        metric_indexes,
        metric_is_turn,
        metric_is_event,
        metric_normalize,
        isAnyTurn,
    };
}
