import {
    CITY_RANGE_CONTEXT,
    normalizeCityRange,
} from "./cityRange";

export const BUBBLE_CITY_RANGE_CONTEXT = CITY_RANGE_CONTEXT;

export function normalizeBubbleCityRange(values: number[]): [number, number] {
    return normalizeCityRange(values);
}
