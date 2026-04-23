import {
    clearRowSelection,
    toggleAllFilteredRows,
    toggleRowSelection,
} from "./selection";
import {
    createGridControllerState,
    getAlwaysVisibleColumnKeys,
    getColumnByKey,
    normalizeColumnOrderKeys,
    normalizeGridControllerState,
    normalizeVisibleColumnKeys,
} from "./state";
import type {
    GridBootstrapResult,
    GridControllerState,
    GridPageSize,
    GridQueryState,
    GridRowId,
    GridViewport,
} from "./types";

function getDefaultSortDirection(sortable: false | "text" | "number" | "date"):
    | "asc"
    | "desc" {
    return sortable === "text" ? "asc" : "desc";
}

export function initializeGridController(
    bootstrap: GridBootstrapResult,
    overrides?: Partial<GridControllerState> | Partial<GridQueryState> | null,
): GridControllerState {
    return createGridControllerState(bootstrap, overrides);
}

export function reconcileGridController(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
): GridControllerState {
    return normalizeGridControllerState(bootstrap, state);
}

export function toggleGridSort(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    columnKey: string,
): GridControllerState {
    const column = getColumnByKey(bootstrap, columnKey);
    if (!column || column.sortable === false) return state;

    const nextSort: { key: string; dir: "asc" | "desc" } =
        state.sort?.key === columnKey
            ? {
                  key: columnKey,
                  dir: state.sort.dir === "asc" ? "desc" : "asc",
              }
            : {
                  key: columnKey,
                  dir: getDefaultSortDirection(column.sortable),
              };

    return normalizeGridControllerState(bootstrap, {
        ...state,
        sort: nextSort,
        pageIndex: 0,
        viewport: state.pageSize === "all" ? { start: 0, end: 0 } : undefined,
    });
}

export function setGridFilter(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    columnKey: string,
    value: string,
): GridControllerState {
    const normalizedValue = value.trim();
    const currentValue = state.filters[columnKey] ?? "";
    if (normalizedValue === currentValue) return state;

    const filters = { ...state.filters };
    if (!normalizedValue) delete filters[columnKey];
    else filters[columnKey] = normalizedValue;

    return normalizeGridControllerState(bootstrap, {
        ...state,
        filters,
        pageIndex: 0,
        viewport: state.pageSize === "all" ? { start: 0, end: 0 } : undefined,
    });
}

export function setGridPageIndex(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    pageIndex: number,
): GridControllerState {
    const nextPageIndex = Math.max(0, Math.floor(pageIndex));
    if (nextPageIndex === state.pageIndex) return state;

    return normalizeGridControllerState(bootstrap, {
        ...state,
        pageIndex: nextPageIndex,
    });
}

export function setGridPageSize(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    pageSize: GridPageSize,
): GridControllerState {
    if (pageSize === state.pageSize) return state;

    return normalizeGridControllerState(bootstrap, {
        ...state,
        pageSize,
        pageIndex: 0,
        viewport: pageSize === "all" ? { start: 0, end: 0 } : undefined,
    });
}

export function setGridViewport(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    viewport: GridViewport,
): GridControllerState {
    if (state.pageSize !== "all") return state;
    if (
        state.viewport?.start === viewport.start &&
        state.viewport?.end === viewport.end
    ) {
        return state;
    }

    return normalizeGridControllerState(bootstrap, {
        ...state,
        viewport,
    });
}

export function toggleGridColumnVisibility(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    columnKey: string,
): GridControllerState {
    const column = getColumnByKey(bootstrap, columnKey);
    if (!column) return state;
    if (column.alwaysVisible) return state;

    const visible = new Set(state.visibleColumnKeys);
    if (visible.has(columnKey)) visible.delete(columnKey);
    else visible.add(columnKey);

    const nextVisible = normalizeVisibleColumnKeys(
        bootstrap,
        Array.from(visible),
        getAlwaysVisibleColumnKeys(bootstrap),
    );

    return normalizeGridControllerState(bootstrap, {
        ...state,
        visibleColumnKeys: nextVisible,
    });
}

export function showAllGridColumns(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
): GridControllerState {
    return normalizeGridControllerState(bootstrap, {
        ...state,
        visibleColumnKeys: bootstrap.columns.map((column) => column.key),
    });
}

export function hideAllGridColumns(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
): GridControllerState {
    return normalizeGridControllerState(bootstrap, {
        ...state,
        visibleColumnKeys: getAlwaysVisibleColumnKeys(bootstrap),
    });
}

export function moveGridColumn(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    columnKey: string,
    delta: -1 | 1,
): GridControllerState {
    const order = normalizeColumnOrderKeys(bootstrap, state.columnOrderKeys);
    const index = order.indexOf(columnKey);
    if (index < 0) return state;

    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= order.length) return state;

    const nextOrder = [...order];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(nextIndex, 0, moved);

    return normalizeGridControllerState(bootstrap, {
        ...state,
        columnOrderKeys: nextOrder,
    });
}

export function moveGridColumnToIndex(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    columnKey: string,
    targetIndex: number,
): GridControllerState {
    const order = normalizeColumnOrderKeys(bootstrap, state.columnOrderKeys);
    const index = order.indexOf(columnKey);
    if (index < 0) return state;

    const boundedTargetIndex = Math.max(0, Math.min(order.length - 1, targetIndex));
    if (index === boundedTargetIndex) return state;

    const nextOrder = [...order];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(boundedTargetIndex, 0, moved);

    return normalizeGridControllerState(bootstrap, {
        ...state,
        columnOrderKeys: nextOrder,
    });
}

export function toggleGridRowExpanded(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    rowId: GridRowId,
): GridControllerState {
    const expanded = new Set(state.expandedRowIds);
    if (expanded.has(rowId)) expanded.delete(rowId);
    else expanded.add(rowId);

    return normalizeGridControllerState(bootstrap, {
        ...state,
        expandedRowIds: Array.from(expanded),
    });
}

export function toggleGridRowSelection(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    orderedRowIds: GridRowId[],
    rowId: GridRowId,
    shiftKey: boolean,
): GridControllerState {
    return normalizeGridControllerState(
        bootstrap,
        toggleRowSelection(state, orderedRowIds, rowId, shiftKey),
    );
}

export function toggleGridAllFilteredRows(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
    filteredRowIds: GridRowId[],
): GridControllerState {
    return normalizeGridControllerState(
        bootstrap,
        toggleAllFilteredRows(state, filteredRowIds),
    );
}

export function clearGridSelection(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
): GridControllerState {
    return normalizeGridControllerState(bootstrap, clearRowSelection(state));
}

export function areAllFilteredRowsSelected(
    state: GridControllerState,
    filteredRowIds: GridRowId[],
): boolean {
    if (filteredRowIds.length === 0) return false;
    const selected = new Set(state.selectedRowIds);
    return filteredRowIds.every((rowId) => selected.has(rowId));
}

export function getOrderedVisibleColumnKeys(
    bootstrap: GridBootstrapResult,
    state: GridControllerState,
): string[] {
    const visible = new Set(state.visibleColumnKeys);
    return normalizeColumnOrderKeys(bootstrap, state.columnOrderKeys).filter(
        (key) => visible.has(key),
    );
}
