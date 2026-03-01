import {
    moveWidgetByDelta,
    moveWidgetToIndex as moveWidgetToIndexInList,
    type ConflictKPIWidget,
    type MetricCard,
    type PresetCardKey,
    type ScopeSnapshot,
    type WidgetEntity,
    type WidgetScope,
} from "./kpi";

type RankingCardDraft = {
    entity: WidgetEntity;
    metric: string;
    scope: WidgetScope;
    limit: number;
};

type MetricCardDraft = {
    entity: WidgetEntity;
    metric: string;
    scope: WidgetScope;
    aggregation: MetricCard["aggregation"];
    normalizeBy?: string | null;
};

type CreateConflictKpiWidgetActionsOptions = {
    getWidgets: () => ConflictKPIWidget[];
    setWidgets: (widgets: ConflictKPIWidget[]) => void;
    persistWidgets: (widgets: ConflictKPIWidget[]) => void;
    makeId: (prefix: string) => string;
    hasSelectionForScope: (scope: WidgetScope) => boolean;
    buildSelectionSnapshot: () => ScopeSnapshot;
};

export function createConflictKpiWidgetActions(
    options: CreateConflictKpiWidgetActionsOptions,
) {
    function commit(nextWidgets: ConflictKPIWidget[]): void {
        options.setWidgets(nextWidgets);
        options.persistWidgets(nextWidgets);
    }

    function hasPresetCard(key: PresetCardKey): boolean {
        return options
            .getWidgets()
            .some((widget) => widget.kind === "preset" && widget.key === key);
    }

    function setWidgets(widgets: ConflictKPIWidget[]): void {
        commit(widgets);
    }

    function removeWidget(id: string): void {
        commit(options.getWidgets().filter((widget) => widget.id !== id));
    }

    function moveWidget(id: string, delta: number): void {
        commit(moveWidgetByDelta(options.getWidgets(), id, delta));
    }

    function moveWidgetToIndex(id: string, targetIndex: number): void {
        commit(moveWidgetToIndexInList(options.getWidgets(), id, targetIndex));
    }

    function addPresetCard(key: PresetCardKey): boolean {
        if (hasPresetCard(key)) return false;
        commit([
            ...options.getWidgets(),
            {
                id: options.makeId("preset"),
                kind: "preset",
                key,
            },
        ]);
        return true;
    }

    function addRankingCard(draft: RankingCardDraft): boolean {
        if (draft.scope === "selection" && !options.hasSelectionForScope(draft.scope)) {
            return false;
        }

        commit([
            ...options.getWidgets(),
            {
                id: options.makeId("ranking"),
                kind: "ranking",
                entity: draft.entity,
                metric: draft.metric,
                scope: draft.scope,
                limit: Math.max(1, draft.limit),
                snapshot:
                    draft.scope === "selection"
                        ? options.buildSelectionSnapshot()
                        : undefined,
            },
        ]);
        return true;
    }

    function addMetricCard(draft: MetricCardDraft): boolean {
        if (draft.scope === "selection" && !options.hasSelectionForScope(draft.scope)) {
            return false;
        }

        commit([
            ...options.getWidgets(),
            {
                id: options.makeId("metric"),
                kind: "metric",
                entity: draft.entity,
                metric: draft.metric,
                scope: draft.scope,
                aggregation: draft.aggregation,
                source: "conflict",
                normalizeBy: draft.normalizeBy || null,
                snapshot:
                    draft.scope === "selection"
                        ? options.buildSelectionSnapshot()
                        : undefined,
            },
        ]);
        return true;
    }

    return {
        setWidgets,
        removeWidget,
        moveWidget,
        moveWidgetToIndex,
        addPresetCard,
        addRankingCard,
        addMetricCard,
    };
}
