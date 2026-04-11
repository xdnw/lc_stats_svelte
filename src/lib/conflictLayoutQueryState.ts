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

const REQUIRED_COLUMNS_BY_LAYOUT: Record<0 | 1 | 2, string[]> = {
    0: ["name"],
    1: ["name"],
    2: ["alliance", "name"],
};

export function normalizeConflictLayoutColumns(
    layout: 0 | 1 | 2,
    columns: string[],
): string[] {
    const required = REQUIRED_COLUMNS_BY_LAYOUT[layout] ?? REQUIRED_COLUMNS_BY_LAYOUT[0];
    const deduped = columns
        .map((value) => value.trim())
        .filter(Boolean)
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