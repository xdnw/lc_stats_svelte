export function isCumulativeMetricName(metricName: string): boolean {
    // Graph metrics with a namespace are event-series metrics in the graph payloads.
    // They should accumulate over time and enable range selection in the graph views.
    return metricName.includes(":");
}
