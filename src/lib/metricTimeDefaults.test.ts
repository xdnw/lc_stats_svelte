import { describe, expect, it } from "vitest";

import {
    DEFAULT_METRIC_TIME_AGGREGATION_MODE,
    parseMetricTimeAggregationMode,
} from "./metricTimeDefaults";

describe("metric-time aggregation defaults", () => {
    it("defaults to coalition when the query param is missing", () => {
        expect(DEFAULT_METRIC_TIME_AGGREGATION_MODE).toBe("coalition");
        expect(parseMetricTimeAggregationMode(null)).toBe("coalition");
        expect(parseMetricTimeAggregationMode(undefined)).toBe("coalition");
    });

    it("still accepts explicit alliance and coalition query values", () => {
        expect(parseMetricTimeAggregationMode("alliance")).toBe("alliance");
        expect(parseMetricTimeAggregationMode("coalition")).toBe("coalition");
    });
});