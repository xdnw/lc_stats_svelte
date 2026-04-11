import { getAavaMetricLabels } from "./aava";
import type { AavaSelectionRow } from "./aavaSelection";
import { commafy, formatAllianceName } from "./formatting";
import {
    createInMemoryGridProvider,
    type InMemoryGridColumn,
} from "./grid/providers/inMemoryProvider";
import type { GridDataProvider } from "./grid/types";

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

function normalizeNumber(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function formatNumericText(value: number): string {
    const normalized = normalizeNumber(value);
    const rounded = Math.round(normalized * 100) / 100;
    return commafy(rounded);
}

function formatPercentText(value: number): string {
    return `${normalizeNumber(value).toFixed(2)}%`;
}

const AAVA_SELECTED_TONE = "ux-grid-tone-selected";
const AAVA_COMPARED_TONE = "ux-grid-tone-compared";

export function createAavaGridProvider(
    rows: AavaSelectionRow[],
    header: string,
): GridDataProvider {
    const labels = getAavaColumnLabels(header);
    const numericColumn = (
        key: Exclude<AavaColumnKey, "name" | "primary_share_pct" | "row_share_pct">,
        label: string,
        toneClass?: string,
    ): InMemoryGridColumn<AavaSelectionRow> => ({
        key,
        title: label,
        toneClass,
        sortable: "number",
        filterable: false,
        summary: "sum-avg",
        detailsEligible: false,
        getCell: (row) => ({
            kind: "number",
            text: formatNumericText(row[key]),
            value: normalizeNumber(row[key]),
        }),
        getExportCells: (row) => [row[key]],
        getSummaryValue: (row) => normalizeNumber(row[key]),
    });
    const percentColumn = (
        key: Extract<AavaColumnKey, "primary_share_pct" | "row_share_pct">,
        label: string,
        toneClass?: string,
    ): InMemoryGridColumn<AavaSelectionRow> => ({
        key,
        title: label,
        toneClass,
        sortable: "number",
        filterable: false,
        summary: null,
        detailsEligible: false,
        getCell: (row) => ({
            kind: "number",
            text: formatPercentText(row[key]),
            value: normalizeNumber(row[key]),
        }),
        getExportCells: (row) => [row[key]],
    });

    const columns: InMemoryGridColumn<AavaSelectionRow>[] = [
        {
            key: "name",
            title: labels.name,
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            alwaysVisible: true,
            getCell: (row) => ({
                kind: "link",
                text: formatAllianceName(row.alliance[0], row.alliance[1]),
                href: `https://politicsandwar.com/alliance/id=${row.alliance[1]}`,
                external: true,
            }),
            getFilterText: (row) =>
                formatAllianceName(row.alliance[0], row.alliance[1]),
            getExportCells: (row) => [
                formatAllianceName(row.alliance[0], row.alliance[1]),
                row.alliance[1],
            ],
            exportColumns: ["alliance", "alliance_id"],
        },
        numericColumn(
            "primary_to_row",
            labels.primary_to_row,
            AAVA_SELECTED_TONE,
        ),
        numericColumn(
            "row_to_primary",
            labels.row_to_primary,
            AAVA_COMPARED_TONE,
        ),
        numericColumn("net", labels.net),
        numericColumn("total", labels.total),
        percentColumn(
            "primary_share_pct",
            labels.primary_share_pct,
            AAVA_SELECTED_TONE,
        ),
        percentColumn(
            "row_share_pct",
            labels.row_share_pct,
            AAVA_COMPARED_TONE,
        ),
        numericColumn("abs_net", labels.abs_net),
    ];

    return createInMemoryGridProvider({
        rows,
        columns,
        getRowId: (row) => row.alliance[1],
        defaultSort: { key: "net", dir: "desc" },
        defaultVisibleColumnKeys: AAVA_DEFAULT_VISIBLE_COLUMN_KEYS,
    });
}
