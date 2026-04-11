import type {
    GridBootstrapResult,
    GridColumnDefinition,
    GridControllerState,
    GridPageSize,
    GridQueryState,
    GridRowId,
    GridSort,
    GridViewport,
} from "./types";

export const GRID_PAGE_SIZE_OPTIONS: GridPageSize[] = [10, 25, 50, 100, "all"];
export const GRID_DEFAULT_PAGE_SIZE: GridPageSize = 10;

function uniqueKeys(values: string[]): string[] {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        next.push(value);
    }
    return next;
}

function uniqueRowIds(values: GridRowId[]): GridRowId[] {
    const seen = new Set<GridRowId>();
    const next: GridRowId[] = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        next.push(value);
    }
    return next;
}

export function getColumnByKey(
    bootstrap: GridBootstrapResult,
    key: string,
): GridColumnDefinition | undefined {
    return bootstrap.columns.find((column) => column.key === key);
}

export function getAlwaysVisibleColumnKeys(
    bootstrap: GridBootstrapResult,
): string[] {
    return bootstrap.columns
        .filter((column) => column.alwaysVisible)
        .map((column) => column.key);
}

export function normalizeColumnOrderKeys(
    bootstrap: GridBootstrapResult,
    requested: string[] | null | undefined,
): string[] {
    const allKeys = bootstrap.columns.map((column) => column.key);
    const known = new Set(allKeys);
    const order = uniqueKeys((requested ?? []).filter((key) => known.has(key)));
    for (const key of allKeys) {
        if (!order.includes(key)) order.push(key);
    }
    return order;
}

export function normalizeVisibleColumnKeys(
    bootstrap: GridBootstrapResult,
    requested: string[] | null | undefined,
    fallback: string[] | null | undefined = bootstrap.defaultVisibleColumnKeys,
): string[] {
    const known = new Set(bootstrap.columns.map((column) => column.key));
    const alwaysVisible = getAlwaysVisibleColumnKeys(bootstrap);
    const next = uniqueKeys((requested ?? []).filter((key) => known.has(key)));
    if (next.length === 0) {
        next.push(
            ...uniqueKeys((fallback ?? []).filter((key) => known.has(key))),
        );
    }
    for (const key of alwaysVisible) {
        if (!next.includes(key)) next.unshift(key);
    }
    return uniqueKeys(next);
}

export function normalizeFilters(
    bootstrap: GridBootstrapResult,
    filters: Record<string, string> | null | undefined,
): Record<string, string> {
    const next: Record<string, string> = {};
    if (!filters) return next;

    for (const [key, value] of Object.entries(filters)) {
        const column = getColumnByKey(bootstrap, key);
        if (!column?.filterable) continue;
        const normalized = value.trim();
        if (!normalized) continue;
        next[key] = normalized;
    }

    return next;
}

export function normalizePageSize(value: GridPageSize | null | undefined): GridPageSize {
    return GRID_PAGE_SIZE_OPTIONS.includes(value ?? GRID_DEFAULT_PAGE_SIZE)
        ? (value ?? GRID_DEFAULT_PAGE_SIZE)
        : GRID_DEFAULT_PAGE_SIZE;
}

export function normalizeSort(
    bootstrap: GridBootstrapResult,
    sort: GridSort | null | undefined,
): GridSort | null {
    if (!sort) return bootstrap.defaultSort ?? null;
    const column = getColumnByKey(bootstrap, sort.key);
    if (!column || column.sortable === false) {
        return bootstrap.defaultSort ?? null;
    }
    return {
        key: column.key,
        dir: sort.dir === "asc" ? "asc" : "desc",
    };
}

export function normalizeViewport(
    viewport: GridViewport | null | undefined,
): GridViewport | undefined {
    if (!viewport) return undefined;
    const start = Math.max(0, Math.floor(viewport.start));
    const end = Math.max(start, Math.floor(viewport.end));
    return { start, end };
}

export function normalizeGridControllerState(
    bootstrap: GridBootstrapResult,
    state?: Partial<GridControllerState> | Partial<GridQueryState> | null,
): GridControllerState {
    const pageSize = normalizePageSize(state?.pageSize);
    const visibleColumnKeys = normalizeVisibleColumnKeys(
        bootstrap,
        state?.visibleColumnKeys,
    );
    const columnOrderKeys = normalizeColumnOrderKeys(
        bootstrap,
        state?.columnOrderKeys,
    );

    return {
        sort: normalizeSort(bootstrap, state?.sort),
        filters: normalizeFilters(bootstrap, state?.filters),
        pageIndex: Math.max(0, Math.floor(state?.pageIndex ?? 0)),
        pageSize,
        visibleColumnKeys,
        columnOrderKeys,
        expandedRowIds: uniqueRowIds(state?.expandedRowIds ?? []),
        selectedRowIds: uniqueRowIds(state?.selectedRowIds ?? []),
        viewport: pageSize === "all" ? normalizeViewport(state?.viewport) : undefined,
        selectionAnchorRowId:
            (state as GridControllerState | undefined)?.selectionAnchorRowId ?? null,
    };
}

export function createGridControllerState(
    bootstrap: GridBootstrapResult,
    overrides?: Partial<GridControllerState> | Partial<GridQueryState> | null,
): GridControllerState {
    return normalizeGridControllerState(bootstrap, overrides);
}

export function toGridQueryState(state: GridControllerState): GridQueryState {
    return {
        sort: state.sort,
        filters: { ...state.filters },
        pageIndex: state.pageIndex,
        pageSize: state.pageSize,
        visibleColumnKeys: [...state.visibleColumnKeys],
        columnOrderKeys: [...state.columnOrderKeys],
        expandedRowIds: [...state.expandedRowIds],
        selectedRowIds: [...state.selectedRowIds],
        viewport: state.viewport ? { ...state.viewport } : undefined,
    };
}

export function getOrderedColumns(
    bootstrap: GridBootstrapResult,
    state: GridQueryState | GridControllerState,
): GridColumnDefinition[] {
    const order = normalizeColumnOrderKeys(bootstrap, state.columnOrderKeys);
    return order
        .map((key) => getColumnByKey(bootstrap, key))
        .filter((column): column is GridColumnDefinition => !!column);
}

export function getVisibleColumns(
    bootstrap: GridBootstrapResult,
    state: GridQueryState | GridControllerState,
): GridColumnDefinition[] {
    const visible = new Set(
        normalizeVisibleColumnKeys(bootstrap, state.visibleColumnKeys),
    );
    return getOrderedColumns(bootstrap, state).filter((column) =>
        visible.has(column.key),
    );
}

export function getHiddenDetailColumns(
    bootstrap: GridBootstrapResult,
    state: GridQueryState | GridControllerState,
): GridColumnDefinition[] {
    const visible = new Set(
        normalizeVisibleColumnKeys(bootstrap, state.visibleColumnKeys),
    );
    return getOrderedColumns(bootstrap, state).filter(
        (column) => !visible.has(column.key) && column.detailsEligible !== false,
    );
}
