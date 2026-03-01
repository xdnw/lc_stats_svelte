import { buildAavaSelectionRows } from "./aavaSelection";
import type { Conflict, TableData } from "./types";
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
    getRawData: () => Conflict | null;
    getEntityTable: (entity: WidgetEntity) => TableData | null;
    getNamesByAllianceId: () => Record<number, string>;
    formatAllianceName: (name: string, allianceId: number) => string;
    formatNationName: (name: string, nationId: number) => string;
};

type RankingBaseRow = Omit<RankingViewRow, "valueText">;

function snapshotCacheKey(snapshot?: ScopeSnapshot): string {
    if (!snapshot) return "-";
    const allianceIds = snapshot.allianceIds?.join(".") ?? "";
    const nationIds = snapshot.nationIds?.join(".") ?? "";
    return `${allianceIds}|${nationIds}`;
}

function aavaSnapshotCacheKey(snapshot: AavaSnapshot): string {
    return `${snapshot.header}|${snapshot.primaryCoalitionIndex === 1 ? 1 : 0}|${snapshot.primaryIds.join(".")}|${snapshot.vsIds.join(".")}`;
}

function getAavaMetricValue(row: any, metric: string): number {
    return Number(row?.[metric]) || 0;
}

function formatMetricValue(
    table: TableData | null,
    metricIndex: number,
    value: number,
    isAavaMetric = false,
): string {
    if (isAavaMetric && metricIndex === -1) {
        if (Number.isFinite(value)) {
            if (Math.abs(value) <= 100 && `${value}`.includes(".")) {
                return value.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                });
            }
            return value.toLocaleString();
        }
        return "0";
    }

    const moneyColumns = table?.cell_format?.formatMoney ?? [];
    const isMoney = moneyColumns.includes(metricIndex);
    const formatted = Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
    return isMoney ? `$${formatted}` : formatted;
}

export function createConflictKpiComputations(
    options: CreateConflictKpiComputationsOptions,
) {
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
                ? aavaSnapshotCacheKey(card.aavaSnapshot)
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
            snapshotCacheKey(card.snapshot),
        ].join("|");
    }

    function metricCacheKey(card: MetricCard): string {
        if (card.source === "aava") {
            const snapshotKey = card.aavaSnapshot
                ? aavaSnapshotCacheKey(card.aavaSnapshot)
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
            snapshotCacheKey(card.snapshot),
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
                valueText: formatMetricValue(table, metricIndex, row.value, isAavaMetric),
            }))
            .slice(0, Math.max(1, limit));
    }

    function mapConflictRankingRows(
        card: RankingCard,
        table: TableData,
        metricIndex: number,
    ): RankingBaseRow[] {
        const rows = getScopedRows(card.entity, card.scope, table, card.snapshot);
        const namesByAllianceId = options.getNamesByAllianceId();

        return rows.map((row) => {
            if (card.entity === "alliance") {
                const allianceId = Number(row[0]?.[1]);
                return {
                    label: options.formatAllianceName(row[0]?.[0], allianceId),
                    allianceId,
                    value: Number(row[metricIndex]) || 0,
                };
            }

            const nationId = Number(row[0]?.[1]);
            const allianceId = Number(row[0]?.[2]);
            return {
                label: options.formatNationName(row[0]?.[0], nationId),
                nationId,
                allianceName: options.formatAllianceName(
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
        if (!options.getRawData()) return [];

        return getAavaRows(card.aavaSnapshot).map((row) => ({
            label: row.alliance[0],
            allianceId: row.alliance[1],
            value: getAavaMetricValue(row, card.metric),
        }));
    }

    function getAavaRows(snapshot: AavaSnapshot): ReturnType<typeof buildAavaSelectionRows> {
        const rawData = options.getRawData();
        if (!rawData) return [];
        const cacheKey = aavaSnapshotCacheKey(snapshot);
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
        const cacheKey = `${entity}|${scope}|${snapshotCacheKey(snapshot)}`;
        const cached = scopedRowsCache.get(cacheKey);
        if (cached) return cached;

        let rows: any[];
        if (scope === "all") return table.data;

        if (scope === "selection") {
            const allianceIds = new Set<number>(snapshot?.allianceIds ?? []);
            const nationIds = new Set<number>(snapshot?.nationIds ?? []);
            if (entity === "alliance") {
                if (allianceIds.size === 0) {
                    rows = [];
                } else {
                    rows = table.data.filter((row) => {
                        const allianceId = Number(row[0]?.[1]);
                        return allianceIds.has(allianceId);
                    });
                }
            } else if (nationIds.size > 0) {
                rows = table.data.filter((row) => {
                    const nationId = Number(row[0]?.[1]);
                    return nationIds.has(nationId);
                });
            } else if (allianceIds.size > 0) {
                rows = table.data.filter((row) => {
                    const nationAllianceId = Number(row[0]?.[2]);
                    return allianceIds.has(nationAllianceId);
                });
            } else {
                rows = [];
            }
            scopedRowsCache.set(cacheKey, rows);
            return rows;
        }

        const rawData = options.getRawData();
        if (!rawData) {
            rows = table.data;
            scopedRowsCache.set(cacheKey, rows);
            return rows;
        }

        const coalitionAllianceIds =
            scope === "coalition1"
                ? new Set<number>(rawData.coalitions[0]?.alliance_ids ?? [])
                : new Set<number>(rawData.coalitions[1]?.alliance_ids ?? []);

        rows = table.data.filter((row) => {
            if (entity === "alliance") {
                const allianceId = Number(row[0]?.[1]);
                return coalitionAllianceIds.has(allianceId);
            }
            const nationAllianceId = Number(row[0]?.[2]);
            return coalitionAllianceIds.has(nationAllianceId);
        });
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

        const table = options.getEntityTable(card.entity);
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
            if (!options.getRawData()) return null;
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

        const table = options.getEntityTable(card.entity);
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
