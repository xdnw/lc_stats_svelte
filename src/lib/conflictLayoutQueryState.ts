import {
    CONFLICT_LAYOUT_TAB_INDEX,
    layoutTabFromIndex,
    resolveLayoutTabFromUrl,
} from "./conflictTabs";

export type ConflictLayoutQueryDefaults = {
    layout: 0 | 1 | 2;
    sort: string;
    order: "asc" | "desc";
    columns: string[];
};

export type ConflictLayoutQueryState = {
    layout: 0 | 1 | 2;
    sort: string;
    order: "asc" | "desc";
    columns: string[];
};

const REQUIRED_CONFLICT_LAYOUT_COLUMN = "name";

function normalizeConflictLayoutColumns(columns: string[]): string[] {
    if (columns.includes(REQUIRED_CONFLICT_LAYOUT_COLUMN)) {
        return columns;
    }

    // Conflict tables always render the leading identity column from `name`.
    return [REQUIRED_CONFLICT_LAYOUT_COLUMN, ...columns];
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
            parsedColumns.length > 0
                ? parsedColumns
                : [...defaults.columns],
        ),
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
    };
}