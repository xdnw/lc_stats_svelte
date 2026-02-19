export const UNITS_PER_CITY: { [key: string]: number } = {
    soldier: 15_000,
    tank: 1250,
    aircraft: 75,
    ship: 15,
    infra: 1,
};

export type MetricAccessors = {
    metric_ids: number[];
    metric_indexes: number[];
    metric_is_turn: boolean[];
    metric_normalize: number[];
    isAnyTurn: boolean;
};

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
    data: {
        metric_names: string[];
        metrics_turn: number[];
        metrics_day: number[];
    },
    metrics: Array<{ name: string; normalize: boolean }>,
): MetricAccessors | null {
    let metric_ids: number[] = [];
    let metric_indexes: number[] = [];
    let metric_is_turn: boolean[] = [];
    let metric_normalize: number[] = [];

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
            let perCity = UNITS_PER_CITY[metric.name];
            metric_normalize.push(perCity | 0);
        } else {
            metric_normalize.push(-1);
        }
    }

    let isAnyTurn = metric_is_turn.reduce((a, b) => a || b, false);
    return {
        metric_ids,
        metric_indexes,
        metric_is_turn,
        metric_normalize,
        isAnyTurn,
    };
}
