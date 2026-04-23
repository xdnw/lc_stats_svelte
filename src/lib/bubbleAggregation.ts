export type BubbleAggregationMode = "alliance" | "coalition";

export const DEFAULT_BUBBLE_AGGREGATION_MODE: BubbleAggregationMode =
    "alliance";

export function parseBubbleAggregationMode(
    value: string | null | undefined,
): BubbleAggregationMode {
    return value === "coalition"
        ? "coalition"
        : DEFAULT_BUBBLE_AGGREGATION_MODE;
}