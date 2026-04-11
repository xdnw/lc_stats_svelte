import type { GridControllerState, GridRowId } from "./types";

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
    const selected = new Set(state.selectedRowIds);
    const rowAlreadySelected = selected.has(rowId);

    if (
        shiftKey &&
        state.selectionAnchorRowId != null &&
        orderedRowIds.length > 0
    ) {
        const anchorIndex = orderedRowIds.indexOf(state.selectionAnchorRowId);
        const nextIndex = orderedRowIds.indexOf(rowId);
        if (anchorIndex >= 0 && nextIndex >= 0) {
            const [start, end] =
                anchorIndex <= nextIndex
                    ? [anchorIndex, nextIndex]
                    : [nextIndex, anchorIndex];
            const shouldSelect = !rowAlreadySelected;
            for (let index = start; index <= end; index += 1) {
                const currentRowId = orderedRowIds[index];
                if (shouldSelect) selected.add(currentRowId);
                else selected.delete(currentRowId);
            }
            return {
                ...state,
                selectedRowIds: uniqueRowIds(Array.from(selected)),
                selectionAnchorRowId: rowId,
            };
        }
    }

    if (rowAlreadySelected) selected.delete(rowId);
    else selected.add(rowId);

    return {
        ...state,
        selectedRowIds: uniqueRowIds(Array.from(selected)),
        selectionAnchorRowId: rowId,
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
