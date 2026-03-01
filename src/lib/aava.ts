import { resolveWarWebMetricMeta, trimHeader } from "./index";
import type { CompositeMergeDiagnostics } from "./compositeMerge";
import type { Conflict } from "./types";

export type AavaMetricKey =
    | "primary_to_row"
    | "row_to_primary"
    | "net"
    | "total"
    | "primary_share_pct"
    | "row_share_pct"
    | "abs_net";

export const AAVA_METRIC_KEYS: AavaMetricKey[] = [
    "primary_to_row",
    "row_to_primary",
    "net",
    "total",
    "primary_share_pct",
    "row_share_pct",
    "abs_net",
];

export function getAavaMetricLabels(
    header: string,
): Record<AavaMetricKey, string> {
    const meta = resolveWarWebMetricMeta(header);
    return {
        primary_to_row: meta.primaryToRowLabel(header),
        row_to_primary: meta.rowToPrimaryLabel(header),
        net: "Net",
        total: "Total",
        primary_share_pct: "Selected share %",
        row_share_pct: "Compared share %",
        abs_net: "Abs Net",
    };
}

export function getAavaMetricLabel(metric: string, header: string): string {
    const labels = getAavaMetricLabels(header);
    return labels[metric as AavaMetricKey] ?? trimHeader(metric);
}

export type AavaCapability = {
    capable: boolean;
    reasons: string[];
};

export function deriveAavaCapability(
    conflict: Conflict,
    diagnostics: CompositeMergeDiagnostics | null,
): AavaCapability {
    if (diagnostics) {
        return {
            capable: diagnostics.aavaCapable,
            reasons: [...diagnostics.aavaIncompatibilities],
        };
    }

    const headers = conflict.war_web?.headers;
    const data = conflict.war_web?.data;
    const capable =
        Array.isArray(headers) &&
        headers.length > 0 &&
        Array.isArray(data) &&
        data.length > 0;

    return {
        capable,
        reasons: capable
            ? []
            : ["Conflict does not have a valid war-web matrix for AAvA."],
    };
}
