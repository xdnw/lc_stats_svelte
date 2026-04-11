import type { GridPageSize, GridQueryState, GridSort } from "./types";

export type PersistedGridQueryState = Partial<
    Pick<
        GridQueryState,
        "sort" | "filters" | "pageSize" | "visibleColumnKeys" | "columnOrderKeys"
    >
>;

const GRID_PAGE_SIZE_VALUES: GridPageSize[] = [10, 25, 50, 100, "all"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSort(value: unknown): GridSort | undefined {
    if (!isPlainObject(value)) return undefined;

    const key = typeof value.key === "string" ? value.key.trim() : "";
    const dir = value.dir === "asc" || value.dir === "desc" ? value.dir : null;
    if (!key || dir == null) return undefined;

    return { key, dir };
}

function normalizeFilters(value: unknown): Record<string, string> | undefined {
    if (!isPlainObject(value)) return undefined;

    const entries = Object.entries(value)
        .map(([key, rawFilter]) => {
            const filter = typeof rawFilter === "string" ? rawFilter.trim() : "";
            return [key.trim(), filter] as const;
        })
        .filter(([key, filter]) => key.length > 0 && filter.length > 0)
        .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return undefined;

    return Object.fromEntries(entries);
}

function normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const seen = new Set<string>();
    const next: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") continue;
        const normalized = item.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        next.push(normalized);
    }

    return next.length > 0 ? next : undefined;
}

function normalizePageSize(value: unknown): GridPageSize | undefined {
    if (!GRID_PAGE_SIZE_VALUES.includes(value as GridPageSize)) {
        return undefined;
    }
    return value as GridPageSize;
}

function normalizePersistedGridQueryState(
    value: Partial<GridQueryState> | Record<string, unknown> | null | undefined,
): PersistedGridQueryState {
    if (!isPlainObject(value)) return {};

    const next: PersistedGridQueryState = {};
    const sort = normalizeSort(value.sort);
    const filters = normalizeFilters(value.filters);
    const pageSize = normalizePageSize(value.pageSize);
    const visibleColumnKeys = normalizeStringArray(value.visibleColumnKeys);
    const columnOrderKeys = normalizeStringArray(value.columnOrderKeys);

    if (sort) {
        next.sort = sort;
    }
    if (filters) {
        next.filters = filters;
    }
    if (pageSize) {
        next.pageSize = pageSize;
    }
    if (visibleColumnKeys) {
        next.visibleColumnKeys = visibleColumnKeys;
    }
    if (columnOrderKeys) {
        next.columnOrderKeys = columnOrderKeys;
    }

    return next;
}

function sortsEqual(
    left: GridSort | null | undefined,
    right: GridSort | null | undefined,
): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.key === right.key && left.dir === right.dir;
}

function stringArraysEqual(left?: string[], right?: string[]): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function filtersEqual(
    left?: Record<string, string>,
    right?: Record<string, string>,
): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;

    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    if (leftEntries.length !== rightEntries.length) return false;

    return leftEntries.every(([key, value], index) => {
        const [rightKey, rightValue] = rightEntries[index] ?? [];
        return key === rightKey && value === rightValue;
    });
}

export function createGridQueryStateOverride(
    state: Partial<GridQueryState> | null | undefined,
    defaults?: Partial<GridQueryState> | null,
): PersistedGridQueryState | null {
    const normalizedState = normalizePersistedGridQueryState(state);
    const normalizedDefaults = normalizePersistedGridQueryState(defaults);
    const next: PersistedGridQueryState = {};

    if (!sortsEqual(normalizedState.sort, normalizedDefaults.sort) && normalizedState.sort) {
        next.sort = normalizedState.sort;
    }
    if (
        !filtersEqual(normalizedState.filters, normalizedDefaults.filters) &&
        normalizedState.filters
    ) {
        next.filters = normalizedState.filters;
    }
    if (normalizedState.pageSize !== normalizedDefaults.pageSize && normalizedState.pageSize) {
        next.pageSize = normalizedState.pageSize;
    }
    if (
        !stringArraysEqual(
            normalizedState.visibleColumnKeys,
            normalizedDefaults.visibleColumnKeys,
        ) && normalizedState.visibleColumnKeys
    ) {
        next.visibleColumnKeys = normalizedState.visibleColumnKeys;
    }
    if (
        !stringArraysEqual(
            normalizedState.columnOrderKeys,
            normalizedDefaults.columnOrderKeys,
        ) && normalizedState.columnOrderKeys
    ) {
        next.columnOrderKeys = normalizedState.columnOrderKeys;
    }

    return Object.keys(next).length > 0 ? next : null;
}

export function serializeGridQueryState(
    state: Partial<GridQueryState> | null | undefined,
    defaults?: Partial<GridQueryState> | null,
): string | null {
    const next = createGridQueryStateOverride(state, defaults);
    return next ? JSON.stringify(next) : null;
}

export function parseGridQueryState(
    rawValue: string | null | undefined,
): PersistedGridQueryState | null {
    if (!rawValue) return null;

    try {
        const parsed = JSON.parse(rawValue) as Record<string, unknown>;
        const normalized = normalizePersistedGridQueryState(parsed);
        return Object.keys(normalized).length > 0 ? normalized : null;
    } catch {
        return null;
    }
}

export function parseGridPageSizeQueryState(
    rawValue: string | null | undefined,
): GridPageSize | null {
    return parseGridQueryState(rawValue)?.pageSize ?? null;
}

export function serializeGridPageSizeQueryState(
    pageSize: GridPageSize | null | undefined,
    defaultPageSize: GridPageSize = 10,
): string | null {
    const normalizedPageSize = normalizePageSize(pageSize);
    if (!normalizedPageSize || normalizedPageSize === defaultPageSize) {
        return null;
    }

    return JSON.stringify({ pageSize: normalizedPageSize });
}
