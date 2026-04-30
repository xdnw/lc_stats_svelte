import {
    CONFLICT_LAYOUT_TAB_INDEX,
    layoutTabFromIndex,
    resolveLayoutTabFromUrl,
} from "./conflictTabs";
import {
    getConflictCustomColumnIdsForLayout,
    isConflictCustomColumnId,
    parseConflictCustomColumnsFromQuery,
    serializeConflictCustomColumnsForQuery,
    type ConflictCustomColumnConfig,
} from "./conflictCustomColumns";
import { decodeQueryParamValue } from "./queryState";

export type ConflictLayoutQueryDefaults = {
    layout: 0 | 1 | 2;
    sort: string;
    order: "asc" | "desc";
    columns: string[];
    customColumns: ConflictCustomColumnConfig[];
};

export type ConflictLayoutQueryState = {
    layout: 0 | 1 | 2;
    sort: string;
    order: "asc" | "desc";
    columns: string[];
    customColumns: ConflictCustomColumnConfig[];
};

const REQUIRED_COLUMNS_BY_LAYOUT: Record<0 | 1 | 2, string[]> = {
    0: ["name"],
    1: ["name"],
    2: ["alliance", "name"],
};

export function normalizeConflictLayoutColumns(
    layout: 0 | 1 | 2,
    columns: string[],
    options?: { customColumnIds?: Iterable<string> | null },
): string[] {
    const required = REQUIRED_COLUMNS_BY_LAYOUT[layout] ?? REQUIRED_COLUMNS_BY_LAYOUT[0];
    const customColumnIds = new Set(options?.customColumnIds ?? []);
    const deduped = columns
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value) => {
            if (!isConflictCustomColumnId(value)) {
                return true;
            }
            return customColumnIds.has(value);
        })
        .filter((value, index, values) => values.indexOf(value) === index);
    const remaining = deduped.filter((column) => !required.includes(column));
    return [...required, ...remaining];
}

export function parseConflictLayoutQuery(
    query: URLSearchParams,
    defaults: ConflictLayoutQueryDefaults,
): ConflictLayoutQueryState {
    const layoutTab = resolveLayoutTabFromUrl(query);
    const sort = query.get("sort") ?? defaults.sort;
    const orderParam = query.get("order");
    const order = orderParam === "asc" || orderParam === "desc"
        ? orderParam
        : defaults.order;
    const customColumns = parseConflictCustomColumnsFromQuery(
        decodeQueryParamValue("cc", query.get("cc")),
    );

    const columnsParam = query.get("columns");
    const parsedColumns = columnsParam
        ? columnsParam
            .split(".")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    return {
        layout: CONFLICT_LAYOUT_TAB_INDEX[layoutTab],
        sort,
        order,
        columns: normalizeConflictLayoutColumns(
            CONFLICT_LAYOUT_TAB_INDEX[layoutTab],
            parsedColumns.length > 0
                ? parsedColumns
                : [...defaults.columns],
            {
                customColumnIds: getConflictCustomColumnIdsForLayout(
                    CONFLICT_LAYOUT_TAB_INDEX[layoutTab],
                    customColumns,
                ),
            },
        ),
        customColumns,
    };
}

export function serializeConflictLayoutQuery(
    state: ConflictLayoutQueryState,
    options?: { clearSortAndColumns?: boolean },
): Record<string, string | null> {
    return {
        layout: layoutTabFromIndex(state.layout),
        sort: options?.clearSortAndColumns ? null : state.sort,
        order: state.order,
        columns: options?.clearSortAndColumns ? null : state.columns.join("."),
        cc: options?.clearSortAndColumns
            ? null
            : serializeConflictCustomColumnsForQuery(state.customColumns),
    };
}