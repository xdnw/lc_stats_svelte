export type ConflictReturnQuery = {
    layout?: string | null;
    sort?: string | null;
    order?: string | null;
    columns?: string | null;
};

const CONFLICT_RETURN_QUERY_KEY_MAP = {
    layout: "conflictLayout",
    sort: "conflictSort",
    order: "conflictOrder",
    columns: "conflictColumns",
} as const;

const CONFLICT_RETURN_QUERY_KEYS = Object.keys(
    CONFLICT_RETURN_QUERY_KEY_MAP,
) as Array<keyof ConflictReturnQuery>;

export function readConflictReturnQuery(
    searchParams: URLSearchParams | null | undefined,
): ConflictReturnQuery | null {
    if (!searchParams) return null;

    const query: ConflictReturnQuery = {};
    for (const key of CONFLICT_RETURN_QUERY_KEYS) {
        const value = searchParams.get(CONFLICT_RETURN_QUERY_KEY_MAP[key]);
        if (value == null || value === "") continue;
        query[key] = value;
    }

    return hasConflictReturnQuery(query) ? query : null;
}

export function applyConflictReturnQuery(
    searchParams: URLSearchParams,
    query: ConflictReturnQuery | null | undefined,
): void {
    for (const key of CONFLICT_RETURN_QUERY_KEYS) {
        const paramKey = CONFLICT_RETURN_QUERY_KEY_MAP[key];
        const value = query?.[key] ?? null;
        if (value == null || value === "") {
            searchParams.delete(paramKey);
            continue;
        }
        searchParams.set(paramKey, value);
    }
}

export function hasConflictReturnQuery(
    query: ConflictReturnQuery | null | undefined,
): query is ConflictReturnQuery {
    if (!query) return false;
    return CONFLICT_RETURN_QUERY_KEYS.some((key) => {
        const value = query[key];
        return value != null && value !== "";
    });
}
