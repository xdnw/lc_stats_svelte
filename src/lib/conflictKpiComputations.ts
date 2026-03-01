import { buildAavaSelectionRows } from "./aavaSelection";
import { buildAavaSnapshotKey, buildScopeSnapshotKey } from "./cacheKeys";
import { formatMetricDisplay } from "./numberFormatting";
import { getScopedRows as getScopedRowsForTable } from "./scopeFiltering";
import type { ConflictKpiContext } from "./conflictKpiTypes";
import type { TableData } from "./types";
import type {
    MetricCard,
    RankingCard,
    ScopeSnapshot,
    WidgetEntity,
    WidgetScope,
} from "./kpi";

type AavaSnapshot = {
    header: string;
    primaryIds: number[];
    vsIds: number[];
    primaryCoalitionIndex?: 0 | 1;
};

export type RankingViewRow = {
    label: string;
    nationId?: number;
    allianceName?: string;
    allianceId?: number;
    value: number;
    valueText: string;
};

type CreateConflictKpiComputationsOptions = {
    context: ConflictKpiContext;
};

type RankingBaseRow = Omit<RankingViewRow, "valueText">;

function getAavaMetricValue(row: any, metric: string): number {
    return Number(row?.[metric]) || 0;
}

export function createConflictKpiComputations(
    options: CreateConflictKpiComputationsOptions,
) {
    const dataContext = options.context.data;
    const scopedRowsCache = new Map<string, any[]>();
    const rankingRowsCache = new Map<string, RankingViewRow[]>();
    const metricValueCache = new Map<string, number | null>();
    const aavaRowsCache = new Map<string, ReturnType<typeof buildAavaSelectionRows>>();

    function clearCaches(): void {
        // Contract: call on any raw dataset or widget-definition change.
        // Callers own invalidation timing; this module owns cache internals only.
        scopedRowsCache.clear();
        rankingRowsCache.clear();
        metricValueCache.clear();
        aavaRowsCache.clear();
    }

    function rankingCacheKey(card: RankingCard): string {
        if (card.source === "aava") {
            const snapshotKey = card.aavaSnapshot
                ? buildAavaSnapshotKey(card.aavaSnapshot)
                : "-";
            return `rank|aava|${card.id}|${card.metric}|${card.limit}|${snapshotKey}`;
        }

        return [
            "rank",
            "conflict",
            card.id,
            card.entity,
            card.metric,
            card.scope,
            card.limit,
            buildScopeSnapshotKey(card.snapshot),
        ].join("|");
    }

    function metricCacheKey(card: MetricCard): string {
        if (card.source === "aava") {
            const snapshotKey = card.aavaSnapshot
                ? buildAavaSnapshotKey(card.aavaSnapshot)
                : "-";
            return [
                "metric",
                "aava",
                card.id,
                card.metric,
                card.aggregation,
                card.normalizeBy ?? "",
                snapshotKey,
            ].join("|");
        }

        return [
            "metric",
            "conflict",
            card.id,
            card.entity,
            card.metric,
            card.scope,
            card.aggregation,
            card.normalizeBy ?? "",
            buildScopeSnapshotKey(card.snapshot),
        ].join("|");
    }

    function finalizeRankingRows(
        rows: RankingBaseRow[],
        table: TableData | null,
        metricIndex: number,
        limit: number,
        isAavaMetric = false,
    ): RankingViewRow[] {
        return rows
            .sort((a, b) => b.value - a.value)
            .map((row) => ({
                ...row,
                valueText: formatMetricDisplay(
                    table,
                    metricIndex,
                    row.value,
                    isAavaMetric,
                ),
            }))
            .slice(0, Math.max(1, limit));
    }

    function mapConflictRankingRows(
        card: RankingCard,
        table: TableData,
        metricIndex: number,
    ): RankingBaseRow[] {
        const rows = getScopedRows(card.entity, card.scope, table, card.snapshot);
        const namesByAllianceId = dataContext.getNamesByAllianceId();

        return rows.map((row) => {
            if (card.entity === "alliance") {
                const allianceId = Number(row[0]?.[1]);
                return {
                    label: dataContext.formatAllianceName(row[0]?.[0], allianceId),
                    allianceId,
                    value: Number(row[metricIndex]) || 0,
                };
            }

            const nationId = Number(row[0]?.[1]);
            const allianceId = Number(row[0]?.[2]);
            return {
                label: dataContext.formatNationName(row[0]?.[0], nationId),
                nationId,
                allianceName: dataContext.formatAllianceName(
                    namesByAllianceId[allianceId],
                    allianceId,
                ),
                allianceId,
                value: Number(row[metricIndex]) || 0,
            };
        });
    }

    function mapAavaRankingRows(card: RankingCard): RankingBaseRow[] {
        if (!card.aavaSnapshot || card.entity !== "alliance") return [];
        if (!dataContext.getRawData()) return [];

        return getAavaRows(card.aavaSnapshot).map((row) => ({
            label: row.alliance[0],
            allianceId: row.alliance[1],
            value: getAavaMetricValue(row, card.metric),
        }));
    }

    function getAavaRows(snapshot: AavaSnapshot): ReturnType<typeof buildAavaSelectionRows> {
        const rawData = dataContext.getRawData();
        if (!rawData) return [];
        const cacheKey = buildAavaSnapshotKey(snapshot);
        const cached = aavaRowsCache.get(cacheKey);
        if (cached) return cached;
        const rows = buildAavaSelectionRows(rawData, {
            header: snapshot.header,
            primaryIds: snapshot.primaryIds,
            vsIds: snapshot.vsIds,
            primaryCoalitionIndex: snapshot.primaryCoalitionIndex,
        });
        aavaRowsCache.set(cacheKey, rows);
        return rows;
    }

    function getScopedRows(
        entity: WidgetEntity,
        scope: WidgetScope,
        table: TableData,
        snapshot?: ScopeSnapshot,
    ): any[] {
        const cacheKey = `${entity}|${scope}|${buildScopeSnapshotKey(snapshot)}`;
        const cached = scopedRowsCache.get(cacheKey);
        if (cached) return cached;

        const rows = getScopedRowsForTable(
            entity,
            scope,
            table,
            snapshot,
            dataContext.getRawData(),
        );
        scopedRowsCache.set(cacheKey, rows);
        return rows;
    }

    function getRankingRows(card: RankingCard): RankingViewRow[] {
        const cacheKey = rankingCacheKey(card);
        const cached = rankingRowsCache.get(cacheKey);
        if (cached) return cached;

        let rowsForCard: RankingViewRow[];
        if (card.source === "aava") {
            const baseRows = mapAavaRankingRows(card);
            rowsForCard = finalizeRankingRows(baseRows, null, -1, card.limit, true);
            rankingRowsCache.set(cacheKey, rowsForCard);
            return rowsForCard;
        }

        const table = dataContext.getEntityTable(card.entity);
        if (!table) return [];
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return [];

        const baseRows = mapConflictRankingRows(card, table, metricIndex);
        rowsForCard = finalizeRankingRows(baseRows, table, metricIndex, card.limit);

        rankingRowsCache.set(cacheKey, rowsForCard);
        return rowsForCard;
    }

    function getMetricCardValue(card: MetricCard): number | null {
        const cacheKey = metricCacheKey(card);
        const cached = metricValueCache.get(cacheKey);
        if (cached !== undefined) return cached;

        let value: number | null = null;
        if (card.source === "aava") {
            if (!card.aavaSnapshot || card.entity !== "alliance") return null;
            if (!dataContext.getRawData()) return null;
            const rows = getAavaRows(card.aavaSnapshot);
            const vals = rows.map((row) => getAavaMetricValue(row, card.metric));
            if (vals.length === 0) return null;

            if (card.normalizeBy) {
                const denoms = rows.map((row) =>
                    getAavaMetricValue(row, card.normalizeBy as string),
                );
                if (card.aggregation === "sum") {
                    const numerator = vals.reduce((a, b) => a + b, 0);
                    const denominator = denoms.reduce((a, b) => a + b, 0);
                    value = denominator === 0 ? null : numerator / denominator;
                    metricValueCache.set(cacheKey, value);
                    return value;
                }
                const ratios = vals
                    .map((numerator, idx) => {
                        const denominator = denoms[idx];
                        return denominator === 0 ? null : numerator / denominator;
                    })
                    .filter((item): item is number => item != null);
                if (ratios.length === 0) {
                    metricValueCache.set(cacheKey, null);
                    return null;
                }
                value = ratios.reduce((a, b) => a + b, 0) / ratios.length;
                metricValueCache.set(cacheKey, value);
                return value;
            }

            const sum = vals.reduce((a, b) => a + b, 0);
            value = card.aggregation === "avg" ? sum / vals.length : sum;
            metricValueCache.set(cacheKey, value);
            return value;
        }

        const table = dataContext.getEntityTable(card.entity);
        if (!table) return null;
        const metricIndex = table.columns.indexOf(card.metric);
        if (metricIndex === -1) return null;
        const rows = getScopedRows(card.entity, card.scope, table, card.snapshot);
        const vals = rows.map((row) => Number(row[metricIndex]) || 0);
        if (vals.length === 0) return null;

        if (card.normalizeBy) {
            const normalizeIndex = table.columns.indexOf(card.normalizeBy);
            if (normalizeIndex === -1) return null;
            const denoms = rows.map((row) => Number(row[normalizeIndex]) || 0);
            if (card.aggregation === "sum") {
                const numerator = vals.reduce((a, b) => a + b, 0);
                const denominator = denoms.reduce((a, b) => a + b, 0);
                value = denominator === 0 ? null : numerator / denominator;
                metricValueCache.set(cacheKey, value);
                return value;
            }
            const ratios = vals
                .map((numerator, idx) => {
                    const denominator = denoms[idx];
                    return denominator === 0 ? null : numerator / denominator;
                })
                .filter((item): item is number => item != null);
            if (ratios.length === 0) {
                metricValueCache.set(cacheKey, null);
                return null;
            }
            value = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            metricValueCache.set(cacheKey, value);
            return value;
        }

        const sum = vals.reduce((a, b) => a + b, 0);
        value = card.aggregation === "avg" ? sum / vals.length : sum;
        metricValueCache.set(cacheKey, value);
        return value;
    }

    return {
        clearCaches,
        getRankingRows,
        getMetricCardValue,
    };
}
