import { describe, expect, it } from "vitest";
import { DEFAULT_CITY_RANGE } from "./cityRange";
import {
    DEFAULT_BUBBLE_METRICS,
    DEFAULT_TIERING_METRICS,
    buildBubbleTraceCacheKey,
    buildDefaultAllianceIdsByCoalition,
    buildMetricTimeSeriesCacheKey,
    buildDefaultTieringAllianceIds,
    buildTieringDatasetCacheKey,
} from "./graphArtifactKeys";

describe("graphArtifactKeys", () => {
    it("gives the route default tiering selection the same cache key as the warmed default dataset", () => {
        const graphFixture = {
            coalitions: [
                { alliance_ids: [101, 102] },
                { alliance_ids: [201, 202] },
            ],
        };
        const defaultAllianceIds = buildDefaultTieringAllianceIds(graphFixture);

        const routeDefaultKey = buildTieringDatasetCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_TIERING_METRICS,
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            useSingleColor: false,
            cityBandSize: 0,
        });
        const warmedDefaultKey = buildTieringDatasetCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_TIERING_METRICS,
            allianceKey: "all",
            useSingleColor: false,
            cityBandSize: 0,
        });
        const narrowedSelectionKey = buildTieringDatasetCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_TIERING_METRICS,
            allianceIds: [[101], [201, 202]],
            defaultAllianceIds,
            useSingleColor: false,
            cityBandSize: 0,
        });

        expect(routeDefaultKey).toBe(warmedDefaultKey);
        expect(narrowedSelectionKey).not.toBe(warmedDefaultKey);
    });

    it("gives bubble default selection the same cache key as the warmed default trace", () => {
        const graphFixture = {
            coalitions: [
                { alliance_ids: [101, 102] },
                { alliance_ids: [201, 202] },
            ],
        };
        const defaultAllianceIds = buildDefaultAllianceIdsByCoalition(graphFixture);

        const routeDefaultKey = buildBubbleTraceCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_BUBBLE_METRICS,
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const warmedDefaultKey = buildBubbleTraceCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_BUBBLE_METRICS,
            allianceKey: "all",
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const narrowedSelectionKey = buildBubbleTraceCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_BUBBLE_METRICS,
            allianceIds: [[101], [201, 202]],
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const coalitionSelectionKey = buildBubbleTraceCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_BUBBLE_METRICS,
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "coalition",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const narrowedCityRangeKey = buildBubbleTraceCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metrics: DEFAULT_BUBBLE_METRICS,
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: [10, 25],
        });

        expect(routeDefaultKey).toBe(warmedDefaultKey);
        expect(narrowedSelectionKey).not.toBe(warmedDefaultKey);
        expect(coalitionSelectionKey).not.toBe(warmedDefaultKey);
        expect(narrowedCityRangeKey).not.toBe(warmedDefaultKey);
    });

    it("uses the shared default alliance key for metric time and varies by metric, cumulative, aggregation mode, and city range", () => {
        const graphFixture = {
            coalitions: [
                { alliance_ids: [101, 102] },
                { alliance_ids: [201, 202] },
            ],
        };
        const defaultAllianceIds = buildDefaultTieringAllianceIds(graphFixture);

        const defaultKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "off:wars", cumulative: true, normalize: false },
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const warmedSelectionKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "off:wars", cumulative: true, normalize: false },
            allianceKey: "all",
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const cumulativeChangedKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "off:wars", cumulative: false, normalize: false },
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const aggregationChangedKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "off:wars", cumulative: true, normalize: false },
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "coalition",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const metricChangedKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "loss:loss_value", cumulative: true, normalize: false },
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: DEFAULT_CITY_RANGE,
        });
        const cityRangeChangedKey = buildMetricTimeSeriesCacheKey({
            conflictId: "test",
            graphVersion: "g1",
            metric: { name: "off:wars", cumulative: true, normalize: false },
            allianceIds: defaultAllianceIds,
            defaultAllianceIds,
            aggregationMode: "alliance",
            cityRange: [10, 25],
        });

        expect(defaultKey).toBe(warmedSelectionKey);
        expect(cumulativeChangedKey).not.toBe(defaultKey);
        expect(aggregationChangedKey).not.toBe(defaultKey);
        expect(metricChangedKey).not.toBe(defaultKey);
        expect(cityRangeChangedKey).not.toBe(defaultKey);
    });
});
