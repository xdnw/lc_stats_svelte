import {
    moveWidgetByDelta,
    moveWidgetToIndex as moveWidgetToIndexInList,
    type ConflictKPIWidget,
    type MetricCard,
    type PresetCardKey,
    type WidgetEntity,
    type WidgetScope,
} from "./kpi";
import type { ConflictKpiContext } from "./conflictKpiTypes";

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
    context: ConflictKpiContext;
};

export function createConflictKpiWidgetActions(
    options: CreateConflictKpiWidgetActionsOptions,
) {
    const widgetContext = options.context.widgets;
    const selectionContext = options.context.selection;

    function commit(nextWidgets: ConflictKPIWidget[]): void {
        widgetContext.setWidgets(nextWidgets);
        widgetContext.persistWidgets(nextWidgets);
    }

    function hasPresetCard(key: PresetCardKey): boolean {
        return widgetContext
            .getWidgets()
            .some((widget) => widget.kind === "preset" && widget.key === key);
    }

    function setWidgets(widgets: ConflictKPIWidget[]): void {
        commit(widgets);
    }

    function removeWidget(id: string): void {
        commit(widgetContext.getWidgets().filter((widget) => widget.id !== id));
    }

    function moveWidget(id: string, delta: number): void {
        commit(moveWidgetByDelta(widgetContext.getWidgets(), id, delta));
    }

    function moveWidgetToIndex(id: string, targetIndex: number): void {
        commit(moveWidgetToIndexInList(widgetContext.getWidgets(), id, targetIndex));
    }

    function addPresetCard(key: PresetCardKey): boolean {
        if (hasPresetCard(key)) return false;
        commit([
            ...widgetContext.getWidgets(),
            {
                id: widgetContext.makeId("preset"),
                kind: "preset",
                key,
            },
        ]);
        return true;
    }

    function addRankingCard(draft: RankingCardDraft): boolean {
        if (draft.scope === "selection" && !selectionContext.hasSelectionForScope(draft.scope)) {
            return false;
        }

        commit([
            ...widgetContext.getWidgets(),
            {
                id: widgetContext.makeId("ranking"),
                kind: "ranking",
                entity: draft.entity,
                metric: draft.metric,
                scope: draft.scope,
                limit: Math.max(1, draft.limit),
                snapshot:
                    draft.scope === "selection"
                        ? selectionContext.buildSelectionSnapshot()
                        : undefined,
            },
        ]);
        return true;
    }

    function addMetricCard(draft: MetricCardDraft): boolean {
        if (draft.scope === "selection" && !selectionContext.hasSelectionForScope(draft.scope)) {
            return false;
        }

        commit([
            ...widgetContext.getWidgets(),
            {
                id: widgetContext.makeId("metric"),
                kind: "metric",
                entity: draft.entity,
                metric: draft.metric,
                scope: draft.scope,
                aggregation: draft.aggregation,
                source: "conflict",
                normalizeBy: draft.normalizeBy || null,
                snapshot:
                    draft.scope === "selection"
                        ? selectionContext.buildSelectionSnapshot()
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
