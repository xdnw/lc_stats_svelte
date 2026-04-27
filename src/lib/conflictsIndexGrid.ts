import { base } from "$app/paths";
import { formatDate } from "./formatting";
import {
    createInMemoryGridProvider,
    type InMemoryGridColumn,
} from "./grid/providers/inMemoryProvider";
import type { GridCellView, GridDataProvider } from "./grid/types";
import { formatMoneyValue, formatNumberValue } from "./numberFormatting";

export const CONFLICTS_INDEX_GRID_DEFAULT_SORT = {
    key: "end",
    dir: "desc",
} as const;

export const CONFLICTS_INDEX_GRID_COLUMN_ORDER = [
    "name",
    "c1_name",
    "c2_name",
    "start",
    "end",
    "category",
    "wars",
    "active_wars",
    "c1_dealt",
    "c2_dealt",
    "total",
    "pinned",
    "c1_alliances",
    "c2_alliances",
    "wiki",
    "status",
    "cb",
    "posts",
] as const;

export type ConflictsIndexAllianceLink = {
    allianceId: number;
    name: string;
};

export type ConflictsIndexPostLink = {
    title: string;
    url: string;
    timestamp: number;
};

export type ConflictsIndexRow = {
    id: number;
    name: string;
    c1Name: string;
    c2Name: string;
    start: number;
    end: number;
    category: string;
    wars: number;
    activeWars: number;
    c1Dealt: number;
    c2Dealt: number;
    total: number;
    pinned: Array<{ side: "C1" | "C2"; allianceId: number; name: string }>;
    c1Alliances: ConflictsIndexAllianceLink[];
    c2Alliances: ConflictsIndexAllianceLink[];
    wikiUrl: string | null;
    status: string | null;
    cb: string | null;
    posts: ConflictsIndexPostLink[];
    rowClass: string;
};

function textCell(text: string): GridCellView {
    return { kind: "text", text };
}

function actionCell(
    text: string,
    actionId: string,
    args: Record<string, string | number | boolean | null>,
    title?: string,
    href?: string,
): GridCellView {
    return {
        kind: "action",
        text,
        actionId,
        args,
        title,
        href,
    };
}

function formatDateCell(value: number): GridCellView {
    return {
        kind: "date",
        text: formatDate(value),
        value,
    };
}

function formatNumberCell(value: number): GridCellView {
    return {
        kind: "number",
        text: formatNumberValue(value),
        value,
    };
}

function formatMoneyCell(value: number): GridCellView {
    return {
        kind: "money",
        text: formatMoneyValue(value),
        value,
    };
}

function linkStack(items: ConflictsIndexAllianceLink[]): GridCellView {
    if (items.length === 0) return { kind: "empty" };
    return {
        kind: "stack",
        items: items.map((item) => ({
            kind: "link",
            text: item.name,
            href: `https://politicsandwar.com/alliance/id=${item.allianceId}`,
            external: true,
        })),
    };
}

function pinnedCell(
    pinned: Array<{ side: "C1" | "C2"; allianceId: number; name: string }>,
): GridCellView {
    if (pinned.length === 0) return { kind: "empty" };
    return {
        kind: "stack",
        items: pinned.map((entry) => ({
            kind: "text",
            text: `${entry.side}:${entry.name}`,
        })),
    };
}

export function getConflictsIndexDefaultVisibleColumnKeys(
    showPinnedColumn: boolean,
): string[] {
    return [
        "name",
        "c1_name",
        "c2_name",
        "start",
        "end",
        "category",
        "wars",
        "active_wars",
        "c1_dealt",
        "c2_dealt",
        "total",
        ...(showPinnedColumn ? ["pinned"] : []),
    ];
}

export function createConflictsIndexGridProvider(options: {
    rows: ConflictsIndexRow[];
    showPinnedColumn: boolean;
}): GridDataProvider {
    const columns: InMemoryGridColumn<ConflictsIndexRow>[] = [
        {
            key: "name",
            title: "Conflict",
            widthHint: "wide",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            alwaysVisible: true,
            getCell: (row) =>
                actionCell(
                    row.name,
                    "open-conflict-card",
                    { conflictId: row.id },
                    `Open conflict actions for ${row.name}`,
                    `${base}/conflict?id=${row.id}`,
                ),
            getFilterText: (row) => row.name,
            getExportCells: (row) => [row.name, row.id],
            exportColumns: ["conflict", "conflict_id"],
        },
        {
            key: "c1_name",
            title: "C1",
            widthHint: "text",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                actionCell(
                    row.c1Name,
                    "open-coalition",
                    { conflictId: row.id, coalitionIndex: 0 },
                    `Show coalition 1 for ${row.name}`,
                ),
            getFilterText: (row) => row.c1Name,
        },
        {
            key: "c2_name",
            title: "C2",
            widthHint: "text",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                actionCell(
                    row.c2Name,
                    "open-coalition",
                    { conflictId: row.id, coalitionIndex: 1 },
                    `Show coalition 2 for ${row.name}`,
                ),
            getFilterText: (row) => row.c2Name,
        },
        {
            key: "start",
            title: "Start",
            widthHint: "fit",
            sortable: "date",
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) => formatDateCell(row.start),
            getExportCells: (row) => [row.start],
        },
        {
            key: "end",
            title: "End",
            widthHint: "fit",
            sortable: "date",
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) => formatDateCell(row.end),
            getSortValue: (row) =>
                row.end === -1 ? Number.MAX_SAFE_INTEGER : row.end,
            getExportCells: (row) => [row.end],
        },
        {
            key: "category",
            title: "Category",
            widthHint: "text",
            sortable: "text",
            filterable: true,
            summary: null,
            detailsEligible: false,
            getCell: (row) => textCell(row.category),
            getFilterText: (row) => row.category,
        },
        {
            key: "wars",
            title: "Wars",
            widthHint: "fit",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
            detailsEligible: false,
            getCell: (row) => formatNumberCell(row.wars),
            getExportCells: (row) => [row.wars],
            getSummaryValue: (row) => row.wars,
        },
        {
            key: "active_wars",
            title: "Active",
            widthHint: "fit",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
            detailsEligible: false,
            getCell: (row) => formatNumberCell(row.activeWars),
            getExportCells: (row) => [row.activeWars],
            getSummaryValue: (row) => row.activeWars,
        },
        {
            key: "c1_dealt",
            title: "C1 dealt",
            widthHint: "fit",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
            detailsEligible: false,
            getCell: (row) => formatMoneyCell(row.c1Dealt),
            getExportCells: (row) => [row.c1Dealt],
            getSummaryValue: (row) => row.c1Dealt,
        },
        {
            key: "c2_dealt",
            title: "C2 dealt",
            widthHint: "fit",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
            detailsEligible: false,
            getCell: (row) => formatMoneyCell(row.c2Dealt),
            getExportCells: (row) => [row.c2Dealt],
            getSummaryValue: (row) => row.c2Dealt,
        },
        {
            key: "total",
            title: "Total",
            widthHint: "fit",
            sortable: "number",
            filterable: false,
            summary: "sum-avg",
            detailsEligible: false,
            getCell: (row) => formatMoneyCell(row.total),
            getExportCells: (row) => [row.total],
            getSummaryValue: (row) => row.total,
        },
        {
            key: "pinned",
            title: "Pinned",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) => pinnedCell(row.pinned),
            getExportCells: (row) => [row.pinned.map((entry) => `${entry.side}:${entry.name}`).join(" | ")],
        },
        {
            key: "c1_alliances",
            title: "Coalition 1",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) => linkStack(row.c1Alliances),
        },
        {
            key: "c2_alliances",
            title: "Coalition 2",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) => linkStack(row.c2Alliances),
        },
        {
            key: "wiki",
            title: "Wiki",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                row.wikiUrl
                    ? {
                          kind: "link",
                          text: "Wiki",
                          href: row.wikiUrl,
                          external: true,
                      }
                    : { kind: "empty" },
            getExportCells: (row) => [row.wikiUrl ?? ""],
        },
        {
            key: "status",
            title: "Status",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                row.status
                                        ? actionCell("Status", "open-field", {
                          conflictId: row.id,
                          field: "status",
                                            }, row.status)
                    : { kind: "empty" },
            getExportCells: (row) => [row.status ?? ""],
        },
        {
            key: "cb",
            title: "CB",
            widthHint: "text",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                row.cb
                                        ? actionCell("CB", "open-field", {
                          conflictId: row.id,
                          field: "cb",
                                            }, row.cb)
                    : { kind: "empty" },
            getExportCells: (row) => [row.cb ?? ""],
        },
        {
            key: "posts",
            title: "Posts",
            widthHint: "fit",
            sortable: false,
            filterable: false,
            summary: null,
            detailsEligible: false,
            getCell: (row) =>
                row.posts.length > 0
                    ? actionCell("Posts", "open-field", {
                          conflictId: row.id,
                          field: "posts",
                      })
                    : { kind: "empty" },
            getExportCells: (row) => [row.posts.map((post) => post.url).join(" | ")],
        },
    ];

    const defaultVisibleColumnKeys = getConflictsIndexDefaultVisibleColumnKeys(
        options.showPinnedColumn,
    );

    return createInMemoryGridProvider({
        rows: options.rows,
        columns,
        getRowId: (row) => row.id,
        getRowClass: (row) => row.rowClass,
        defaultSort: CONFLICTS_INDEX_GRID_DEFAULT_SORT,
        defaultVisibleColumnKeys,
    });
}
