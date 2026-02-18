export type WidgetScope = "all" | "coalition1" | "coalition2" | "selection";
export type WidgetEntity = "alliance" | "nation";
export type WidgetSource = "conflict" | "aava";

export type PresetCardKey =
    | "duration"
    | "wars"
    | "damage-total"
    | "net-gap"
    | "c1-dealt"
    | "c2-dealt"
    | "participation";

export type ScopeSnapshot = {
    allianceIds: number[];
    nationIds: number[];
    label: string;
};

export type AavaScopeSnapshot = {
    header: string;
    primaryCoalitionIndex: 0 | 1;
    primaryIds: number[];
    vsIds: number[];
    label: string;
};

export type RankingCard = {
    id: string;
    kind: "ranking";
    entity: WidgetEntity;
    metric: string;
    scope: WidgetScope;
    limit: number;
    source?: WidgetSource;
    snapshot?: ScopeSnapshot;
    aavaSnapshot?: AavaScopeSnapshot;
};

export type MetricCard = {
    id: string;
    kind: "metric";
    entity: WidgetEntity;
    metric: string;
    scope: WidgetScope;
    aggregation: "sum" | "avg";
    source?: WidgetSource;
    normalizeBy?: string | null;
    snapshot?: ScopeSnapshot;
    aavaSnapshot?: AavaScopeSnapshot;
};

export type PresetCard = {
    id: string;
    kind: "preset";
    key: PresetCardKey;
};

export type ConflictKPIWidget = RankingCard | MetricCard | PresetCard;

export type SharedKpiConfig = {
    version: 1;
    widgets: ConflictKPIWidget[];
};

const DEFAULT_SHARED_KPI_CONFIG: SharedKpiConfig = {
    version: 1,
    widgets: [],
};

function normalizeConflictId(conflictId: string | null | undefined): string {
    const normalized = (conflictId ?? "").trim();
    return normalized.length > 0 ? normalized : "unknown";
}

export function getConflictKpiStorageKey(
    conflictId: string | null | undefined,
): string {
    return `lc_stats:conflict:${normalizeConflictId(conflictId)}:kpi-config`;
}

export function readSharedKpiConfig(
    conflictId: string | null | undefined,
): SharedKpiConfig {
    try {
        const key = getConflictKpiStorageKey(conflictId);
        const raw = localStorage.getItem(key);
        if (!raw) return { ...DEFAULT_SHARED_KPI_CONFIG };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { ...DEFAULT_SHARED_KPI_CONFIG };
        }
        return {
            version: 1,
            widgets: Array.isArray(parsed.widgets)
                ? parsed.widgets
                : Array.isArray(parsed.conflictWidgets)
                  ? parsed.conflictWidgets
                : [],
        };
    } catch (error) {
        console.warn("Failed to read shared KPI config", error);
        return { ...DEFAULT_SHARED_KPI_CONFIG };
    }
}

export function saveSharedKpiConfig(
    conflictId: string | null | undefined,
    config: SharedKpiConfig,
): void {
    try {
        const key = getConflictKpiStorageKey(conflictId);
        localStorage.setItem(
            key,
            JSON.stringify({
                version: 1,
                widgets: config.widgets ?? [],
            }),
        );
    } catch (error) {
        console.warn("Failed to save shared KPI config", error);
    }
}

export function makeKpiId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function moveWidgetByDelta<T extends { id: string }>(
    list: T[],
    id: string,
    delta: number,
): T[] {
    const next = [...list];
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) return list;
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= next.length) return list;
    const [item] = next.splice(index, 1);
    next.splice(newIndex, 0, item);
    return next;
}

export function moveWidgetToIndex<T extends { id: string }>(
    list: T[],
    id: string,
    targetIndex: number,
): T[] {
    const next = [...list];
    const index = next.findIndex((item) => item.id === id);
    if (index === -1 || index === targetIndex) return list;
    if (targetIndex < 0 || targetIndex >= next.length) return list;
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    return next;
}
