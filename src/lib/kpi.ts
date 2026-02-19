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

const PRESET_CARD_KEYS: ReadonlySet<PresetCardKey> = new Set([
    "duration",
    "wars",
    "damage-total",
    "net-gap",
    "c1-dealt",
    "c2-dealt",
    "participation",
]);

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

export function isWidgetScope(scope: unknown): scope is WidgetScope {
    return (
        scope === "all" ||
        scope === "coalition1" ||
        scope === "coalition2" ||
        scope === "selection"
    );
}

export function sanitizeScopeSnapshot(snapshot: unknown): ScopeSnapshot | undefined {
    if (!snapshot || typeof snapshot !== "object") return undefined;

    const value = snapshot as Partial<ScopeSnapshot>;
    const allianceIds = Array.isArray(value.allianceIds)
        ? value.allianceIds
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id))
        : [];
    const nationIds = Array.isArray(value.nationIds)
        ? value.nationIds
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id))
        : [];
    const label =
        typeof value.label === "string" ? value.label : "Selection snapshot";

    return { allianceIds, nationIds, label };
}

export function sanitizeAavaSnapshot(
    snapshot: unknown,
): AavaScopeSnapshot | undefined {
    if (!snapshot || typeof snapshot !== "object") return undefined;

    const value = snapshot as Partial<AavaScopeSnapshot>;
    const primaryCoalitionIndex = value.primaryCoalitionIndex === 1 ? 1 : 0;
    const header = typeof value.header === "string" ? value.header : "wars";
    const label = typeof value.label === "string" ? value.label : "AAvA snapshot";
    const primaryIds = Array.isArray(value.primaryIds)
        ? value.primaryIds
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id))
        : [];
    const vsIds = Array.isArray(value.vsIds)
        ? value.vsIds
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isFinite(id))
        : [];

    return { primaryCoalitionIndex, header, label, primaryIds, vsIds };
}

export function sanitizeKpiWidget(
    item: unknown,
    makeId: (prefix: string) => string = makeKpiId,
): ConflictKPIWidget | null {
    if (!item || typeof item !== "object") return null;

    const value = item as Partial<ConflictKPIWidget> & Record<string, unknown>;

    if (value.kind === "preset") {
        if (!PRESET_CARD_KEYS.has(value.key as PresetCardKey)) return null;
        return {
            id: typeof value.id === "string" ? value.id : makeId("preset"),
            kind: "preset",
            key: value.key as PresetCardKey,
        };
    }

    if (value.kind === "ranking") {
        if (!(value.entity === "alliance" || value.entity === "nation")) return null;
        if (!isWidgetScope(value.scope)) return null;
        if (typeof value.metric !== "string") return null;

        const snapshot = sanitizeScopeSnapshot(value.snapshot);
        const aavaSnapshot = sanitizeAavaSnapshot(value.aavaSnapshot);

        return {
            id: typeof value.id === "string" ? value.id : makeId("ranking"),
            kind: "ranking",
            entity: value.entity,
            metric: value.metric,
            scope: value.scope,
            limit: Math.max(1, Number(value.limit) || 10),
            source: value.source === "aava" ? "aava" : "conflict",
            snapshot,
            aavaSnapshot,
        };
    }

    if (value.kind === "metric") {
        if (!(value.entity === "alliance" || value.entity === "nation")) return null;
        if (!isWidgetScope(value.scope)) return null;
        if (!(value.aggregation === "sum" || value.aggregation === "avg")) {
            return null;
        }
        if (typeof value.metric !== "string") return null;

        const snapshot = sanitizeScopeSnapshot(value.snapshot);
        const aavaSnapshot = sanitizeAavaSnapshot(value.aavaSnapshot);

        return {
            id: typeof value.id === "string" ? value.id : makeId("metric"),
            kind: "metric",
            entity: value.entity,
            metric: value.metric,
            scope: value.scope,
            aggregation: value.aggregation,
            source: value.source === "aava" ? "aava" : "conflict",
            normalizeBy:
                typeof value.normalizeBy === "string" ? value.normalizeBy : null,
            snapshot,
            aavaSnapshot,
        };
    }

    return null;
}

export function buildLegacyKpiWidgets(
    config: unknown,
    makeId: (prefix: string) => string = makeKpiId,
): ConflictKPIWidget[] {
    if (!config || typeof config !== "object") return [];

    const source = config as Record<string, unknown>;
    const widgets: ConflictKPIWidget[] = [];

    const pushSanitized = (list: unknown, kind: ConflictKPIWidget["kind"]) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            const sanitized = sanitizeKpiWidget(item, makeId);
            if (sanitized?.kind === kind) {
                widgets.push(sanitized);
            }
        }
    };

    pushSanitized(source.presetCards, "preset");
    pushSanitized(source.rankingCards, "ranking");
    pushSanitized(source.metricCards, "metric");

    return widgets;
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
