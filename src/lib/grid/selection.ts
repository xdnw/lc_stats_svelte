import type { GridControllerState, GridRowId } from "./types";
import { applyRangeToggle } from "$lib/selection/rangeToggle";

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

export function toggleRowSelection(
    state: GridControllerState,
    orderedRowIds: GridRowId[],
    rowId: GridRowId,
    shiftKey: boolean,
): GridControllerState {
    const nextToggle = applyRangeToggle(
        orderedRowIds,
        new Set(state.selectedRowIds),
        state.selectionAnchorRowId,
        rowId,
        shiftKey,
    );

    return {
        ...state,
        selectedRowIds: uniqueRowIds(Array.from(nextToggle.selected)),
        selectionAnchorRowId: nextToggle.anchor,
    };
}

export function toggleAllFilteredRows(
    state: GridControllerState,
    filteredRowIds: GridRowId[],
): GridControllerState {
    const selected = new Set(state.selectedRowIds);
    const allFilteredSelected =
        filteredRowIds.length > 0 &&
        filteredRowIds.every((rowId) => selected.has(rowId));

    if (allFilteredSelected) {
        for (const rowId of filteredRowIds) {
            selected.delete(rowId);
        }
    } else {
        for (const rowId of filteredRowIds) {
            selected.add(rowId);
        }
    }

    return {
        ...state,
        selectedRowIds: uniqueRowIds(Array.from(selected)),
        selectionAnchorRowId:
            filteredRowIds.length > 0
                ? filteredRowIds[filteredRowIds.length - 1]
                : state.selectionAnchorRowId,
    };
}

export function clearRowSelection(
    state: GridControllerState,
): GridControllerState {
    return {
        ...state,
        selectedRowIds: [],
        selectionAnchorRowId: null,
    };
}
