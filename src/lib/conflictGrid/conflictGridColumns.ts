import type { GridColumnDefinition } from "../grid/types";
import type { Conflict } from "../types";
import { trimHeader } from "../warWeb";

export type ConflictMetricKind =
    | "loss"
    | "dealt"
    | "net"
    | "def"
    | "off"
    | "both";

export type ConflictValueKind = "number" | "money";

export type ConflictGridNameColumnSpec = GridColumnDefinition & {
    kind: "name";
};

export type ConflictGridAllianceColumnSpec = GridColumnDefinition & {
    kind: "alliance";
};

export type ConflictGridMetricColumnSpec = GridColumnDefinition & {
    kind: "metric";
    metricKind: ConflictMetricKind;
    headerIndex: number;
    valueKind: ConflictValueKind;
};

export type ConflictGridColumnSpec =
    | ConflictGridNameColumnSpec
    | ConflictGridAllianceColumnSpec
    | ConflictGridMetricColumnSpec;

function baseMetricKey(header: string): string {
    return header.replace("_loss", "").replace("loss_", "");
}

function isMoneyMetricKey(key: string): boolean {
    return (
        key.includes("~$") ||
        key.includes("damage") ||
        (key.includes("infra") && !key.includes("attacks"))
    );
}

function createMetricColumnSpec(
    key: string,
    headerIndex: number,
    metricKind: ConflictMetricKind,
): ConflictGridMetricColumnSpec {
    return {
        key,
        title: key,
        widthHint: "fit",
        sortable: "number",
        filterable: false,
        summary: "sum-avg",
        detailsEligible: true,
        alwaysVisible: false,
        kind: "metric",
        metricKind,
        headerIndex,
        valueKind: isMoneyMetricKey(key) ? "money" : "number",
    };
}

export function isConflictMetricColumnSpec(
    column: ConflictGridColumnSpec,
): column is ConflictGridMetricColumnSpec {
    return column.kind === "metric";
}

export function buildConflictGridColumnSpecs(
    conflict: Conflict,
): ConflictGridColumnSpec[] {
    const columns: ConflictGridColumnSpec[] = [
        {
            key: "name",
            title: "Name",
            widthHint: "wide",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            alwaysVisible: true,
            kind: "name",
        },
        {
            key: "alliance",
            title: "Alliance",
            widthHint: "text",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            alwaysVisible: false,
            kind: "alliance",
        },
    ];

    conflict.damage_header.forEach((rawHeader, headerIndex) => {
        const header = trimHeader(rawHeader);
        const headerType = conflict.header_type[headerIndex];

        if (headerType === 0) {
            const baseKey = baseMetricKey(header);
            columns.push(
                createMetricColumnSpec(
                    `loss:${header}`,
                    headerIndex,
                    "loss",
                ),
                createMetricColumnSpec(
                    `dealt:${baseKey}`,
                    headerIndex,
                    "dealt",
                ),
                createMetricColumnSpec(
                    `net:${baseKey}`,
                    headerIndex,
                    "net",
                ),
            );
            return;
        }

        columns.push(
            createMetricColumnSpec(`def:${header}`, headerIndex, "def"),
            createMetricColumnSpec(`off:${header}`, headerIndex, "off"),
            createMetricColumnSpec(`both:${header}`, headerIndex, "both"),
        );
    });

    return columns;
}
