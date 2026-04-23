import { describe, expect, it } from "vitest";
import {
    buildCityRangeCacheKey,
    buildCityRangeQuery,
    isEmptyCityIndexRange,
    normalizeCityRange,
    parseCityRange,
    resolveCityIndexRange,
    sumValuesByCityIndexRange,
} from "./cityRange";

describe("cityRange", () => {
    it("normalizes the default city range", () => {
        expect(normalizeCityRange([0, 70])).toEqual([0, 70]);
    });

    it("clamps city ranges to the supported bounds", () => {
        expect(normalizeCityRange([-5, 99])).toEqual([0, 70]);
    });

    it("collapses reversed city handles to one endpoint", () => {
        expect(normalizeCityRange([33, 12])).toEqual([33, 33]);
    });

    it("parses missing params as the default range", () => {
        expect(parseCityRange(new URLSearchParams())).toEqual([0, 70]);
    });

    it("parses route params with shared defaults", () => {
        expect(
            parseCityRange(new URLSearchParams("city_min=20&city_max=35")),
        ).toEqual([20, 35]);
    });

    it("ignores malformed city params instead of partially parsing them", () => {
        expect(
            parseCityRange(new URLSearchParams("city_min=20abc&city_max=35")),
        ).toEqual([0, 35]);
    });

    it("omits default city params from the query state", () => {
        expect(buildCityRangeQuery([0, 70])).toEqual({
            min: null,
            max: null,
        });
    });

    it("serializes restrictive ranges into query state", () => {
        expect(buildCityRangeQuery([20, 35])).toEqual({
            min: 20,
            max: 35,
        });
    });

    it("uses the shared cache key sentinel for the default range", () => {
        expect(buildCityRangeCacheKey([0, 70])).toBe("all");
    });

    it("serializes restrictive ranges into cache keys", () => {
        expect(buildCityRangeCacheKey([10, 25])).toBe("10-25");
    });

    it("resolves coalition-local city indexes from the shared range", () => {
        expect(resolveCityIndexRange([10, 15, 20, 25], [12, 24])).toEqual({
            min: 1,
            max: 2,
        });
    });

    it("returns an empty index range when the selected span matches no cities", () => {
        const cityIndexRange = resolveCityIndexRange([10, 15, 20, 25], [26, 30]);

        expect(cityIndexRange).toEqual({
            min: 0,
            max: -1,
        });
        expect(isEmptyCityIndexRange(cityIndexRange)).toBe(true);
    });

    it("sums only finite values inside the resolved city index range", () => {
        expect(
            sumValuesByCityIndexRange([1, Number.NaN, 3, 4], { min: 1, max: 3 }),
        ).toBe(7);
    });
});
