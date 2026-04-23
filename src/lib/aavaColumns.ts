import { getAavaMetricLabels } from "./aava";

export type AavaColumnKey =
    | "name"
    | "primary_to_row"
    | "row_to_primary"
    | "net"
    | "total"
    | "primary_share_pct"
    | "row_share_pct"
    | "abs_net";

export const AAVA_ALL_COLUMN_KEYS: AavaColumnKey[] = [
    "name",
    "primary_to_row",
    "row_to_primary",
    "net",
    "total",
    "primary_share_pct",
    "row_share_pct",
    "abs_net",
];

export const AAVA_DEFAULT_VISIBLE_COLUMN_KEYS: AavaColumnKey[] = [
    "name",
    "primary_to_row",
    "row_to_primary",
    "net",
    "total",
    "primary_share_pct",
    "row_share_pct",
];

export function getAavaColumnLabels(
    header: string,
): Record<AavaColumnKey, string> {
    const labels = getAavaMetricLabels(header);
    return {
        name: "Alliance",
        primary_to_row: labels.primary_to_row,
        row_to_primary: labels.row_to_primary,
        net: "Net",
        total: "Total",
        primary_share_pct: labels.primary_share_pct,
        row_share_pct: labels.row_share_pct,
        abs_net: "Abs Net",
    };
}