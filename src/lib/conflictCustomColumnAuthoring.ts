import {
    getConflictCustomColumnIdsForLayout,
    getConflictMetricValueUnit,
    isConflictCustomColumnId,
    isConflictCustomMetricKey,
    sanitizeConflictCustomColumn,
    sanitizeConflictCustomColumns,
    type ConflictCustomColumnConfig,
    type ConflictCustomMetricOption,
} from "./conflictCustomColumns";

type ConflictLayoutValue = 0 | 1 | 2;

type ConflictCustomColumnStateSlice = {
    layout: ConflictLayoutValue;
    columns: string[];
    customColumns: ConflictCustomColumnConfig[];
};

const REQUIRED_COLUMNS_BY_LAYOUT: Record<ConflictLayoutValue, string[]> = {
    0: ["name"],
    1: ["name"],
    2: ["alliance", "name"],
};

function dedupeOrdered(values: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        deduped.push(value);
    }

    return deduped;
}

function normalizeConflictLayoutColumnsForCustomColumns(
    layout: ConflictLayoutValue,
    columns: string[],
    customColumnIds: Iterable<string>,
): string[] {
    const required = REQUIRED_COLUMNS_BY_LAYOUT[layout] ?? REQUIRED_COLUMNS_BY_LAYOUT[0];
    const activeIds = new Set(customColumnIds);
    const deduped = columns
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value) => !isConflictCustomColumnId(value) || activeIds.has(value))
        .filter((value, index, values) => values.indexOf(value) === index);
    const remaining = deduped.filter((column) => !required.includes(column));
    return [...required, ...remaining];
}

export function buildConflictCustomMetricOptions(
    columns: Array<{ key: string; title: string }>,
): ConflictCustomMetricOption[] {
    const seen = new Set<string>();
    const options: ConflictCustomMetricOption[] = [];

    for (const column of columns) {
        if (!isConflictCustomMetricKey(column.key) || seen.has(column.key)) {
            continue;
        }

        seen.add(column.key);
        options.push({
            value: column.key,
            label: column.title,
            unit: getConflictMetricValueUnit(column.key),
        });
    }

    return options;
}

export function upsertConflictCustomColumnState(
    state: ConflictCustomColumnStateSlice,
    input: {
        previousId?: string | null;
        config: unknown;
        validMetricKeys?: Iterable<string> | null;
    },
): ConflictCustomColumnStateSlice | null {
    const nextConfig = sanitizeConflictCustomColumn(input.config, input.validMetricKeys);
    if (!nextConfig) {
        return null;
    }
    if (state.layout === 2 && nextConfig.kind !== "row-formula") {
        return null;
    }

    const previousId = input.previousId?.trim() || null;
    let nextCustomColumns = [...state.customColumns];

    if (previousId) {
        const replaceIndex = nextCustomColumns.findIndex((column) => column.id === previousId);
        if (replaceIndex >= 0) {
            nextCustomColumns.splice(replaceIndex, 1, nextConfig);
        } else {
            nextCustomColumns.push(nextConfig);
        }
    } else {
        const existingIndex = nextCustomColumns.findIndex((column) => column.id === nextConfig.id);
        if (existingIndex >= 0) {
            nextCustomColumns.splice(existingIndex, 1, nextConfig);
        } else {
            nextCustomColumns.push(nextConfig);
        }
    }

    nextCustomColumns = sanitizeConflictCustomColumns(nextCustomColumns, input.validMetricKeys);

    let nextColumns = [...state.columns];
    if (previousId && previousId !== nextConfig.id) {
        nextColumns = nextColumns.map((columnKey) =>
            columnKey === previousId ? nextConfig.id : columnKey,
        );
    }
    if (!nextColumns.includes(nextConfig.id)) {
        nextColumns.push(nextConfig.id);
    }

    return {
        layout: state.layout,
        columns: normalizeConflictLayoutColumnsForCustomColumns(
            state.layout,
            dedupeOrdered(nextColumns),
            getConflictCustomColumnIdsForLayout(state.layout, nextCustomColumns),
        ),
        customColumns: nextCustomColumns,
    };
}

export function deleteConflictCustomColumnState(
    state: ConflictCustomColumnStateSlice,
    id: string,
): ConflictCustomColumnStateSlice {
    const nextCustomColumns = state.customColumns.filter((column) => column.id !== id);
    return {
        layout: state.layout,
        columns: normalizeConflictLayoutColumnsForCustomColumns(
            state.layout,
            state.columns.filter((columnKey) => columnKey !== id),
            getConflictCustomColumnIdsForLayout(state.layout, nextCustomColumns),
        ),
        customColumns: nextCustomColumns,
    };
}