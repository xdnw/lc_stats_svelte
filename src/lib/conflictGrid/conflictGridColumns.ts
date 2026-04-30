import type { GridColumnDefinition } from "../grid/types";
import type { ConflictCustomColumnConfig } from "../conflictCustomColumns";
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

export type ConflictGridCustomColumnSpec = GridColumnDefinition & {
    kind: "custom";
    config: ConflictCustomColumnConfig;
};

export type ConflictGridNumericColumnSpec =
    | ConflictGridMetricColumnSpec
    | ConflictGridCustomColumnSpec;

export type ConflictGridColumnSpec =
    | ConflictGridNameColumnSpec
    | ConflictGridAllianceColumnSpec
    | ConflictGridMetricColumnSpec
    | ConflictGridCustomColumnSpec;

function appendUniqueColumns(
    target: ConflictGridColumnSpec[],
    seenKeys: Set<string>,
    ...columns: ConflictGridColumnSpec[]
): void {
    for (const column of columns) {
        if (seenKeys.has(column.key)) continue;
        seenKeys.add(column.key);
        target.push(column);
    }
}

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
        metricEligible: true,
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

export function isConflictNumericColumnSpec(
    column: ConflictGridColumnSpec,
): column is ConflictGridNumericColumnSpec {
    return column.kind === "metric" || column.kind === "custom";
}

function customColumnSummary(
    config: ConflictCustomColumnConfig,
): GridColumnDefinition["summary"] {
    if (
        config.kind === "row-formula" &&
        config.formula.kind === "numeric" &&
        (config.formula.display === "number" || config.formula.display === "money")
    ) {
        return "sum-avg";
    }
    if (
        config.kind === "member-rollup" &&
        config.reducer === "sum" &&
        (config.display === "number" || config.display === "money")
    ) {
        return "sum-avg";
    }
    return null;
}

function createCustomColumnSpec(
    config: ConflictCustomColumnConfig,
): ConflictGridCustomColumnSpec {
    return {
        key: config.id,
        title: config.label,
        widthHint: "fit",
        sortable: "number",
        filterable: false,
        summary: customColumnSummary(config),
        detailsEligible: true,
        exportLabel: config.label,
        alwaysVisible: false,
        metricEligible: false,
        kind: "custom",
        config,
    };
}

export function buildConflictCustomGridColumnSpecs(
    configs: ConflictCustomColumnConfig[],
): ConflictGridCustomColumnSpec[] {
    return configs.map((config) => createCustomColumnSpec(config));
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
            metricEligible: false,
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
            metricEligible: false,
            kind: "alliance",
        },
    ];
    const seenKeys = new Set(columns.map((column) => column.key));

    conflict.damage_header.forEach((rawHeader, headerIndex) => {
        const header = trimHeader(rawHeader);
        const headerType = conflict.header_type[headerIndex];

        if (headerType === 0) {
            const baseKey = baseMetricKey(header);
            appendUniqueColumns(
                columns,
                seenKeys,
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

        appendUniqueColumns(
            columns,
            seenKeys,
            createMetricColumnSpec(`def:${header}`, headerIndex, "def"),
            createMetricColumnSpec(`off:${header}`, headerIndex, "off"),
            createMetricColumnSpec(`both:${header}`, headerIndex, "both"),
        );
    });

    return columns;
}
