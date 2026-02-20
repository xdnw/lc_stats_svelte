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

type CompactScopeSnapshot = {
    a?: number[];
    n?: number[];
};

type CompactAavaSnapshot = {
    h?: string;
    p?: number[];
    v?: number[];
};

type CompactPresetWidget = {
    k: "p";
    p: PresetCardKey;
};

type CompactRankingWidget = {
    k: "r";
    e: "a" | "n";
    m: string;
    s?: "c1" | "c2" | "sel";
    l?: number;
    z?: "a";
    ss?: CompactScopeSnapshot;
    as?: CompactAavaSnapshot;
};

type CompactMetricWidget = {
    k: "m";
    e: "a" | "n";
    m: string;
    s?: "c1" | "c2" | "sel";
    g?: "a";
    n?: string;
    z?: "a";
    ss?: CompactScopeSnapshot;
    as?: CompactAavaSnapshot;
};

type CompactKpiWidget =
    | CompactPresetWidget
    | CompactRankingWidget
    | CompactMetricWidget;

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
            widgets: Array.isArray(parsed.widgets) ? parsed.widgets : [],
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

function compactScope(scope: WidgetScope): "c1" | "c2" | "sel" | undefined {
    if (scope === "coalition1") return "c1";
    if (scope === "coalition2") return "c2";
    if (scope === "selection") return "sel";
    return undefined;
}

function expandScope(scope: "c1" | "c2" | "sel" | undefined): WidgetScope {
    if (scope === "c1") return "coalition1";
    if (scope === "c2") return "coalition2";
    if (scope === "sel") return "selection";
    return "all";
}

function compactEntity(entity: WidgetEntity): "a" | "n" {
    return entity === "alliance" ? "a" : "n";
}

function expandEntity(entity: "a" | "n"): WidgetEntity {
    return entity === "a" ? "alliance" : "nation";
}

function compactScopeSnapshot(snapshot?: ScopeSnapshot): CompactScopeSnapshot | undefined {
    if (!snapshot) return undefined;
    const a = snapshot.allianceIds?.length ? [...snapshot.allianceIds] : undefined;
    const n = snapshot.nationIds?.length ? [...snapshot.nationIds] : undefined;
    if (!a && !n) return undefined;
    return { a, n };
}

function expandScopeSnapshot(snapshot?: CompactScopeSnapshot): ScopeSnapshot | undefined {
    if (!snapshot) return undefined;
    return {
        allianceIds: Array.isArray(snapshot.a)
            ? snapshot.a
                .map((id: unknown) => Number(id))
                .filter((id: number) => Number.isFinite(id))
            : [],
        nationIds: Array.isArray(snapshot.n)
            ? snapshot.n
                .map((id: unknown) => Number(id))
                .filter((id: number) => Number.isFinite(id))
            : [],
        label: "Selection snapshot",
    };
}

function compactAavaSnapshot(snapshot?: AavaScopeSnapshot): CompactAavaSnapshot | undefined {
    if (!snapshot) return undefined;
    const h = snapshot.header && snapshot.header !== "wars" ? snapshot.header : undefined;
    const p = snapshot.primaryIds?.length ? [...snapshot.primaryIds] : undefined;
    const v = snapshot.vsIds?.length ? [...snapshot.vsIds] : undefined;
    if (!h && !p && !v) return undefined;
    return { h, p, v };
}

function expandAavaSnapshot(snapshot?: CompactAavaSnapshot): AavaScopeSnapshot | undefined {
    if (!snapshot) return undefined;
    return {
        header: typeof snapshot.h === "string" ? snapshot.h : "wars",
        primaryCoalitionIndex: 0,
        primaryIds: Array.isArray(snapshot.p)
            ? snapshot.p
                .map((id: unknown) => Number(id))
                .filter((id: number) => Number.isFinite(id))
            : [],
        vsIds: Array.isArray(snapshot.v)
            ? snapshot.v
                .map((id: unknown) => Number(id))
                .filter((id: number) => Number.isFinite(id))
            : [],
        label: "AAvA snapshot",
    };
}

function compactWidget(widget: ConflictKPIWidget): CompactKpiWidget | null {
    if (widget.kind === "preset") {
        return { k: "p", p: widget.key };
    }

    if (widget.kind === "ranking") {
        return {
            k: "r",
            e: compactEntity(widget.entity),
            m: widget.metric,
            s: compactScope(widget.scope),
            l: widget.limit !== 10 ? Math.max(1, Number(widget.limit) || 10) : undefined,
            z: widget.source === "aava" ? "a" : undefined,
            ss: widget.scope === "selection" ? compactScopeSnapshot(widget.snapshot) : undefined,
            as: widget.source === "aava" ? compactAavaSnapshot(widget.aavaSnapshot) : undefined,
        };
    }

    return {
        k: "m",
        e: compactEntity(widget.entity),
        m: widget.metric,
        s: compactScope(widget.scope),
        g: widget.aggregation === "avg" ? "a" : undefined,
        n: typeof widget.normalizeBy === "string" && widget.normalizeBy.length > 0
            ? widget.normalizeBy
            : undefined,
        z: widget.source === "aava" ? "a" : undefined,
        ss: widget.scope === "selection" ? compactScopeSnapshot(widget.snapshot) : undefined,
        as: widget.source === "aava" ? compactAavaSnapshot(widget.aavaSnapshot) : undefined,
    };
}

function expandCompactWidget(item: unknown): ConflictKPIWidget | null {
    if (!item || typeof item !== "object") return null;

    const value = item as Partial<CompactKpiWidget> & Record<string, unknown>;
    if (value.k === "p") {
        return sanitizeKpiWidget({
            kind: "preset",
            key: value.p,
        });
    }

    if (value.k === "r") {
        if (!(value.e === "a" || value.e === "n")) return null;
        if (typeof value.m !== "string") return null;

        return sanitizeKpiWidget({
            kind: "ranking",
            entity: expandEntity(value.e),
            metric: value.m,
            scope: expandScope(value.s as "c1" | "c2" | "sel" | undefined),
            limit: Number(value.l) || 10,
            source: value.z === "a" ? "aava" : "conflict",
            snapshot: expandScopeSnapshot(value.ss as CompactScopeSnapshot | undefined),
            aavaSnapshot: expandAavaSnapshot(value.as as CompactAavaSnapshot | undefined),
        });
    }

    if (value.k === "m") {
        if (!(value.e === "a" || value.e === "n")) return null;
        if (typeof value.m !== "string") return null;

        return sanitizeKpiWidget({
            kind: "metric",
            entity: expandEntity(value.e),
            metric: value.m,
            scope: expandScope(value.s as "c1" | "c2" | "sel" | undefined),
            aggregation: value.g === "a" ? "avg" : "sum",
            source: value.z === "a" ? "aava" : "conflict",
            normalizeBy: typeof value.n === "string" ? value.n : null,
            snapshot: expandScopeSnapshot(value.ss as CompactScopeSnapshot | undefined),
            aavaSnapshot: expandAavaSnapshot(value.as as CompactAavaSnapshot | undefined),
        });
    }

    return null;
}

export function serializeKpiWidgetsForQuery(
    widgets: ConflictKPIWidget[],
    makeId: (prefix: string) => string = makeKpiId,
): string | null {
    try {
        if (!widgets || widgets.length === 0) return null;
        const compact = widgets
            .map((item) => sanitizeKpiWidget(item, makeId))
            .filter((item): item is ConflictKPIWidget => item !== null)
            .map((item) => compactWidget(item))
            .filter((item): item is CompactKpiWidget => item !== null);
        if (compact.length === 0) return null;
        return JSON.stringify(compact);
    } catch (error) {
        console.warn("Failed to serialize compact KPI widgets", error);
        return null;
    }
}

export function parseKpiWidgetsFromQuery(
    raw: string,
    makeId: (prefix: string) => string = makeKpiId,
): ConflictKPIWidget[] {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => expandCompactWidget(item))
            .filter((item): item is ConflictKPIWidget => item !== null)
            .map(
                (item) =>
                    sanitizeKpiWidget(item, makeId) as ConflictKPIWidget,
            );
    } catch {
        return [];
    }
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
