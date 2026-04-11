import type { MetricCard, RankingCard, ScopeSnapshot } from "../kpi";
import type { ConflictKpiRankingRow, ConflictGridPresetMetrics } from "./protocol";
import type { ConflictGridLayoutValue } from "./rowIds";
import type { ConflictGridWorkerClient } from "./workerClient";

export type ConflictKpiProvider = {
    getPresetMetrics: () => Promise<ConflictGridPresetMetrics>;
    getSelectionSnapshot: (
        layout: ConflictGridLayoutValue,
        selectedRowIds: Array<string | number>,
    ) => Promise<ScopeSnapshot>;
    getRankingRows: (card: RankingCard) => Promise<ConflictKpiRankingRow[]>;
    getMetricCardValue: (card: MetricCard) => Promise<number | null>;
};

export function createConflictKpiProvider(options: {
    client: ConflictGridWorkerClient;
    bootstrapLayout: ConflictGridLayoutValue;
}): ConflictKpiProvider {
    return {
        async getPresetMetrics() {
            const payload = await options.client.bootstrap(options.bootstrapLayout);
            return payload.presetMetrics;
        },
        getSelectionSnapshot(layout, selectedRowIds) {
            return options.client.getSelectionSnapshot(layout, selectedRowIds);
        },
        getRankingRows(card) {
            return options.client.getRankingRows(card);
        },
        getMetricCardValue(card) {
            return options.client.getMetricCardValue(card);
        },
    };
}
