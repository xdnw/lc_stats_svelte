import {
    normalizeGraphSliderValues,
    type SliderContext,
} from "./graphSlider";

export type CityRange = [number, number];

export type CityIndexRange = {
    min: number;
    max: number;
};

export const DEFAULT_CITY_RANGE: CityRange = [0, 70];

export const CITY_RANGE_CONTEXT: SliderContext = {
    min: DEFAULT_CITY_RANGE[0],
    max: DEFAULT_CITY_RANGE[1],
    step: 1,
    mode: "range",
};

function parseCityValue(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return null;
    return parsed;
}

function isDefaultNormalizedCityRange(range: CityRange): boolean {
    return (
        range[0] === DEFAULT_CITY_RANGE[0] &&
        range[1] === DEFAULT_CITY_RANGE[1]
    );
}

export function normalizeCityRange(values: number[]): CityRange {
    const normalizedValues = normalizeGraphSliderValues(values, CITY_RANGE_CONTEXT);
    return [
        normalizedValues[0] ?? CITY_RANGE_CONTEXT.min,
        normalizedValues[1] ?? CITY_RANGE_CONTEXT.max,
    ];
}

export function isDefaultCityRange(range: CityRange): boolean {
    const normalizedRange = normalizeCityRange(range);
    return isDefaultNormalizedCityRange(normalizedRange);
}

export function parseCityRange(params: URLSearchParams): CityRange {
    return normalizeCityRange([
        parseCityValue(params.get("city_min")) ?? DEFAULT_CITY_RANGE[0],
        parseCityValue(params.get("city_max")) ?? DEFAULT_CITY_RANGE[1],
    ]);
}

export function buildCityRangeQuery(range: CityRange): {
    min: number | null;
    max: number | null;
} {
    const normalizedRange = normalizeCityRange(range);
    return {
        min:
            normalizedRange[0] === DEFAULT_CITY_RANGE[0]
                ? null
                : normalizedRange[0],
        max:
            normalizedRange[1] === DEFAULT_CITY_RANGE[1]
                ? null
                : normalizedRange[1],
    };
}

export function buildCityRangeCacheKey(range: CityRange): string {
    const normalizedRange = normalizeCityRange(range);
    return isDefaultNormalizedCityRange(normalizedRange)
        ? "all"
        : `${normalizedRange[0]}-${normalizedRange[1]}`;
}

export function isEmptyCityIndexRange(range: CityIndexRange): boolean {
    return range.max < range.min;
}

export function sumValuesByCityIndexRange(
    valuesByCity: number[] | undefined,
    cityRange: CityIndexRange,
): number {
    if (
        !valuesByCity ||
        valuesByCity.length === 0 ||
        isEmptyCityIndexRange(cityRange)
    ) {
        return 0;
    }

    let total = 0;
    let hasValue = false;
    for (
        let cityIndex = cityRange.min;
        cityIndex <= cityRange.max;
        cityIndex += 1
    ) {
        const value = valuesByCity[cityIndex];
        if (value == null || !Number.isFinite(value)) continue;
        total += value;
        hasValue = true;
    }

    return hasValue ? total : 0;
}

export function resolveCityIndexRange(
    cities: number[],
    range: CityRange,
): CityIndexRange {
    if (cities.length === 0) {
        return { min: 0, max: -1 };
    }

    const normalizedRange = normalizeCityRange(range);
    let minCityIndex = 0;
    while (
        minCityIndex < cities.length &&
        (cities[minCityIndex] ?? Number.POSITIVE_INFINITY) <
            normalizedRange[0]
    ) {
        minCityIndex += 1;
    }
    if (minCityIndex >= cities.length) {
        return { min: 0, max: -1 };
    }

    let maxCityIndex = cities.length - 1;
    while (
        maxCityIndex >= minCityIndex &&
        (cities[maxCityIndex] ?? Number.NEGATIVE_INFINITY) >
            normalizedRange[1]
    ) {
        maxCityIndex -= 1;
    }
    if (maxCityIndex < minCityIndex) {
        return { min: 0, max: -1 };
    }

    return {
        min: minCityIndex,
        max: maxCityIndex,
    };
}
