import type {
    ConflictKPIWidget,
    MetricCard,
    RankingCard,
} from "./kpi";
import type { ConflictKpiContext } from "./conflictKpiTypes";

type CreateConflictKpiPresentationOptions = {
    context: ConflictKpiContext;
};

export function createConflictKpiPresentation(
    options: CreateConflictKpiPresentationOptions,
) {
    const presentationContext = options.context.presentation;
    const selectionContext = options.context.selection;

    function metricLabel(metric: string): string {
        return presentationContext.trimHeader(metric);
    }

    function metricDescription(metric: string): string {
        const label = metricLabel(metric);
        const [prefix] = metric.split(":", 1);
        if (prefix === "net") {
            return `${label}: dealt value minus received value.`;
        }
        if (prefix === "dealt") {
            return `${label}: value dealt by the selected entity.`;
        }
        if (prefix === "loss") {
            return `${label}: value received/lost by the selected entity.`;
        }
        if (prefix === "off") {
            return `${label}: offensive activity count for the selected entity.`;
        }
        if (prefix === "def") {
            return `${label}: defensive activity count for the selected entity.`;
        }
        return `${label}: summed or averaged over the selected scope.`;
    }

    function widgetMetricLabel(widget: RankingCard | MetricCard): string {
        if (widget.source === "aava") {
            const header = widget.aavaSnapshot?.header ?? "wars";
            return presentationContext.getAavaMetricLabel(widget.metric, header);
        }
        return metricLabel(widget.metric);
    }

    function widgetNormalizeLabel(widget: MetricCard): string | null {
        if (!widget.normalizeBy) return null;
        if (widget.source === "aava") {
            const header = widget.aavaSnapshot?.header ?? "wars";
            return presentationContext.getAavaMetricLabel(widget.normalizeBy, header);
        }
        return metricLabel(widget.normalizeBy);
    }

    function widgetScopeLabel(widget: ConflictKPIWidget): string {
        if (
            (widget.kind === "ranking" || widget.kind === "metric") &&
            widget.source === "aava"
        ) {
            const snapshotLabel = widget.aavaSnapshot?.label || "AAvA snapshot";
            const header = widget.aavaSnapshot?.header || "wars";
            return `AAvA (${snapshotLabel} · ${header})`;
        }
        if (widget.kind === "preset") return "Preset";
        return selectionContext.scopeLabel(widget.scope, widget.snapshot);
    }

    function widgetManagerLabel(widget: ConflictKPIWidget): string {
        if (widget.kind === "preset") {
            return presentationContext.presetCardLabels[widget.key];
        }
        if (widget.kind === "ranking") {
            return `${widget.entity} · ${widgetMetricLabel(widget)} · ${widgetScopeLabel(widget)} · top ${widget.limit}`;
        }
        const normalized = widgetNormalizeLabel(widget)
            ? ` per ${widgetNormalizeLabel(widget)}`
            : "";
        return `${widget.aggregation.toUpperCase()} ${widget.entity} · ${widgetMetricLabel(widget)}${normalized} · ${widgetScopeLabel(widget)}`;
    }

    return {
        metricLabel,
        metricDescription,
        widgetMetricLabel,
        widgetNormalizeLabel,
        widgetScopeLabel,
        widgetManagerLabel,
    };
}
