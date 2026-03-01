import {
    parseKpiWidgetsFromQuery,
    readSharedKpiConfig,
    saveSharedKpiConfig,
    sanitizeKpiWidget,
    serializeKpiWidgetsForQuery,
    type ConflictKPIWidget,
    type MetricCard,
    type PresetCard,
    type PresetCardKey,
    type RankingCard,
    type ScopeSnapshot,
    type WidgetScope,
} from "./kpi";
import { buildSelectionSnapshot as buildSelectionSnapshotValue } from "./kpiSnapshot";

type KpiIdFactory = (prefix: string) => string;

export const DEFAULT_PRESET_CARDS: PresetCard[] = [
    { id: "preset-duration", kind: "preset", key: "duration" },
    { id: "preset-total-dmg", kind: "preset", key: "damage-total" },
    { id: "preset-net-gap", kind: "preset", key: "net-gap" },
];

export const DEFAULT_RANKING_CARDS: RankingCard[] = [
    {
        id: "rank-alliance-net",
        kind: "ranking",
        entity: "alliance",
        metric: "net:damage",
        scope: "all",
        limit: 8,
    },
    {
        id: "rank-nation-net",
        kind: "ranking",
        entity: "nation",
        metric: "net:damage",
        scope: "all",
        limit: 10,
    },
];

export const PRESET_CARD_LABELS: Record<PresetCardKey, string> = {
    duration: "Duration",
    wars: "Wars tracked",
    "damage-total": "Total damage exchanged",
    "net-gap": "Damage gap",
    "c1-dealt": "Coalition 1 dealt",
    "c2-dealt": "Coalition 2 dealt",
    "off-wars-per-nation": "Offensive wars per nation",
};

export const PRESET_CARD_DESCRIPTIONS: Record<PresetCardKey, string> = {
    duration: "Elapsed time for the conflict from start to now/end.",
    wars: "Maximum wars tracked by either coalition in the summary.",
    "damage-total": "Combined damage dealt by both coalitions.",
    "net-gap": "Absolute net-damage lead of the currently leading side.",
    "c1-dealt": "Raw total damage dealt by Coalition 1.",
    "c2-dealt": "Raw total damage dealt by Coalition 2.",
    "off-wars-per-nation":
        "Average offensive wars launched per nation across summary rows.",
};

const SCOPE_LABELS: Record<WidgetScope, string> = {
    all: "All",
    coalition1: "Coalition 1",
    coalition2: "Coalition 2",
    selection: "Selection snapshot",
};

export const DEFAULT_KPI_WIDGETS: ConflictKPIWidget[] = [
    ...DEFAULT_PRESET_CARDS,
    ...DEFAULT_RANKING_CARDS,
];

export function formatKpiNumber(value: number | null | undefined): string {
    if (value == null || isNaN(value)) return "N/A";
    return value.toLocaleString();
}

export function splitKpiWidgets(widgets: ConflictKPIWidget[]): {
    presetCards: PresetCard[];
    rankingCards: RankingCard[];
    metricCards: MetricCard[];
} {
    const presetCards: PresetCard[] = [];
    const rankingCards: RankingCard[] = [];
    const metricCards: MetricCard[] = [];

    for (const widget of widgets) {
        if (widget.kind === "preset") presetCards.push(widget);
        else if (widget.kind === "ranking") rankingCards.push(widget);
        else if (widget.kind === "metric") metricCards.push(widget);
    }

    return {
        presetCards,
        rankingCards,
        metricCards,
    };
}

export function buildSelectionSnapshot(
    selectedAllianceIds: Set<number>,
    selectedNationIds: Set<number>,
): ScopeSnapshot {
    return buildSelectionSnapshotValue(selectedAllianceIds, selectedNationIds);
}

export function scopeLabel(
    scope: WidgetScope,
    snapshot?: ScopeSnapshot,
): string {
    if (scope !== "selection") return SCOPE_LABELS[scope];
    return snapshot?.label
        ? `Selection (${snapshot.label})`
        : SCOPE_LABELS.selection;
}

export function hasSelectionForScope(
    scope: WidgetScope,
    selectedAllianceIds: Set<number>,
    selectedNationIds: Set<number>,
): boolean {
    if (scope !== "selection") return true;
    return selectedAllianceIds.size > 0 || selectedNationIds.size > 0;
}

export function kpiAddReasonForScope(
    scope: WidgetScope,
    selectedAllianceIds: Set<number>,
    selectedNationIds: Set<number>,
): string {
    if (scope !== "selection") return "";
    if (hasSelectionForScope(scope, selectedAllianceIds, selectedNationIds)) {
        return "";
    }
    return "Selection scope requires at least one selected alliance or nation row in the current table.";
}

export function stripWidgetIds(widgets: ConflictKPIWidget[]) {
    return widgets.map((item) => {
        const { id: _id, ...rest } = item;
        return rest;
    });
}

export function serializeKpiWidgetsForUrl(
    widgets: ConflictKPIWidget[],
    makeId: KpiIdFactory,
): string | null {
    return serializeKpiWidgetsForQuery(widgets, makeId);
}

export function parseKpiWidgetsFromUrl(
    encodedWidgets: string,
    makeId: KpiIdFactory,
): ConflictKPIWidget[] {
    return parseKpiWidgetsFromQuery(encodedWidgets, makeId);
}

export function persistSharedKpiWidgets(
    conflictId: string | null,
    widgets: ConflictKPIWidget[],
): void {
    if (!conflictId) return;
    const config = readSharedKpiConfig(conflictId);
    config.widgets = widgets;
    saveSharedKpiConfig(conflictId, config);
}

export function loadSharedKpiWidgets(
    conflictId: string | null,
    makeId: KpiIdFactory,
): ConflictKPIWidget[] | null {
    if (!conflictId) return null;
    const sharedConfig = readSharedKpiConfig(conflictId);
    if (
        !Array.isArray(sharedConfig.widgets) ||
        sharedConfig.widgets.length === 0
    ) {
        return null;
    }

    const parsedWidgets = sanitizeKpiWidgets(sharedConfig.widgets, makeId);

    return parsedWidgets.length > 0 ? parsedWidgets : null;
}

export function sanitizeKpiWidgets(
    widgets: unknown,
    makeId: KpiIdFactory,
): ConflictKPIWidget[] {
    if (!Array.isArray(widgets)) return [];
    return widgets
        .map((item: any) => sanitizeKpiWidget(item, makeId))
        .filter(
            (item: ConflictKPIWidget | null): item is ConflictKPIWidget =>
                item !== null,
        );
}
