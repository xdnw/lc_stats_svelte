import type { BubbleAggregationMode } from "./bubbleAggregation";
import { isCumulativeMetricName } from "./metrics";
import type { GraphRouteInfo } from "./graphRouteInfo";
import type { TierMetric } from "./types";

type MetricNameSource = Pick<GraphRouteInfo, "metric_names">;

export const DEFAULT_METRIC_TIME_AGGREGATION_MODE: BubbleAggregationMode =
    "coalition";

export function parseMetricTimeAggregationMode(
    value: string | null | undefined,
): BubbleAggregationMode {
    return value === "alliance" || value === "coalition"
        ? value
        : DEFAULT_METRIC_TIME_AGGREGATION_MODE;
}

export function resolveDefaultMetricTimeName(
    info: MetricNameSource,
): string {
    if (info.metric_names.includes("nation")) {
        return "nation";
    }

    return info.metric_names[0] ?? "nation";
}

export function buildRequestedMetricTimeMetric(options: {
    metricName: string | null | undefined;
    cumulativeValue?: string | null | undefined;
}): TierMetric | null {
    const metricName = `${options.metricName ?? ""}`.trim();
    if (!metricName) {
        return null;
    }

    const cumulativeValue = `${options.cumulativeValue ?? ""}`.trim();
    const cumulative = cumulativeValue.length === 0
        ? isCumulativeMetricName(metricName)
        : !["0", "false", "off"].includes(cumulativeValue.toLowerCase());

    return {
        name: metricName,
        cumulative,
        normalize: false,
    };
}

export function resolveRequestedMetricTimeMetric(
    info: MetricNameSource,
    requestedMetric: TierMetric | null | undefined,
): TierMetric {
    const requestedMetricName = `${requestedMetric?.name ?? ""}`.trim();
    const hasRequestedMetric =
        requestedMetricName.length > 0 &&
        info.metric_names.includes(requestedMetricName);
    const metricName = hasRequestedMetric
        ? requestedMetricName
        : resolveDefaultMetricTimeName(info);

    return {
        name: metricName,
        cumulative: hasRequestedMetric
            ? !!requestedMetric?.cumulative
            : isCumulativeMetricName(metricName),
        normalize: false,
    };
}

export function buildDefaultMetricTimeMetric(
    info: MetricNameSource,
): TierMetric {
    return resolveRequestedMetricTimeMetric(info, null);
}
