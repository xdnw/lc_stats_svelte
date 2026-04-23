import { browser } from "$app/environment";
import { appConfig as config } from "$lib/appConfig";
import { parseCityRange } from "$lib/cityRange";
import { acquireMetricTimeArtifactHandle } from "$lib/metricTimeArtifactRegistry";
import {
    buildRequestedMetricTimeMetric,
    parseMetricTimeAggregationMode,
} from "$lib/metricTimeDefaults";

function parseRequestedAllianceIds(
    value: string | null,
): number[] | null {
    const normalized = Array.from(
        new Set(
            `${value ?? ""}`
                .split(".")
                .map((entry) => Number.parseInt(entry, 10))
                .filter((entry) => Number.isFinite(entry) && entry > 0),
        ),
    ).sort((left, right) => left - right);

    return normalized.length > 0 ? normalized : null;
}

export const load = ({
    url,
}: {
    url: URL;
}) => {
    if (!browser) return {};
    const conflictId = url.searchParams.get("id")?.trim();
    if (!conflictId) return {};

    const handle = acquireMetricTimeArtifactHandle({
        conflictId,
        version: config.version.graph_data,
    });
    void handle.bootstrapVisibleSeries({
        metric: buildRequestedMetricTimeMetric({
            metricName: url.searchParams.get("metric"),
            cumulativeValue: url.searchParams.get("cumulative"),
        }),
        aggregationMode: parseMetricTimeAggregationMode(
            url.searchParams.get("aggregation"),
        ),
        requestedAllianceIds: parseRequestedAllianceIds(url.searchParams.get("ids")),
        cityRange: parseCityRange(url.searchParams),
        contextKey: `metric-time:${conflictId}:route-load`,
    }).catch(() => {
        // The page-owned bootstrap path will surface failures if this warm is not usable.
    }).finally(() => {
        handle.destroy();
    });

    return {};
};
