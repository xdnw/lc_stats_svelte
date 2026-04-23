import type {
    GridCellActionArgs,
    GridCellView,
    GridPageResult,
    GridPageRow,
    GridSummaryByColumnKey,
} from "./types";

function areActionArgsEqual(
    left: GridCellActionArgs | undefined,
    right: GridCellActionArgs | undefined,
): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key, index) => {
        const rightKey = rightKeys[index];
        return key === rightKey && left[key] === right[rightKey];
    });
}

export function areGridCellViewsEqual(
    left: GridCellView,
    right: GridCellView,
): boolean {
    if (left === right) return true;
    if (left.kind !== right.kind) return false;

    switch (left.kind) {
        case "text":
            return left.text === (right as GridCellView & { kind: "text" }).text;
        case "number":
        case "money":
            return (
                left.text === (right as GridCellView & { kind: "number" | "money" }).text &&
                left.value === (right as GridCellView & { kind: "number" | "money" }).value
            );
        case "date":
            return (
                left.text === (right as GridCellView & { kind: "date" }).text &&
                left.value === (right as GridCellView & { kind: "date" }).value
            );
        case "link":
            return (
                left.text === (right as GridCellView & { kind: "link" }).text &&
                left.href === (right as GridCellView & { kind: "link" }).href &&
                (left.external ?? false) ===
                    ((right as GridCellView & { kind: "link" }).external ?? false)
            );
        case "action":
            return (
                left.text === (right as GridCellView & { kind: "action" }).text &&
                left.actionId ===
                    (right as GridCellView & { kind: "action" }).actionId &&
                (left.disabled ?? false) ===
                    ((right as GridCellView & { kind: "action" }).disabled ?? false) &&
                (left.title ?? "") ===
                    ((right as GridCellView & { kind: "action" }).title ?? "") &&
                areActionArgsEqual(
                    left.args,
                    (right as GridCellView & { kind: "action" }).args,
                )
            );
        case "stack": {
            const rightItems = (right as GridCellView & { kind: "stack" }).items;
            return (
                left.items.length === rightItems.length &&
                left.items.every((item, index) =>
                    areGridCellViewsEqual(item, rightItems[index]),
                )
            );
        }
        case "empty":
            return true;
    }
}

function areGridRowCellsEqual(
    left: Record<string, GridCellView>,
    right: Record<string, GridCellView>,
): boolean {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key, index) => {
        const rightKey = rightKeys[index];
        return (
            key === rightKey &&
            right[rightKey] != null &&
            areGridCellViewsEqual(left[key], right[rightKey])
        );
    });
}

export function areGridPageRowsEqual(
    left: GridPageRow[],
    right: GridPageRow[],
): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;

    return left.every((row, index) => {
        const rightRow = right[index];
        return (
            row.id === rightRow?.id &&
            (row.rowClass ?? null) === (rightRow?.rowClass ?? null) &&
            areGridRowCellsEqual(row.cells, rightRow?.cells ?? {})
        );
    });
}

export function areGridPageResultsEqual(
    left: GridPageResult | null | undefined,
    right: GridPageResult | null | undefined,
): boolean {
    if (left === right) return true;
    if (!left || !right) return false;

    return (
        left.totalRowCount === right.totalRowCount &&
        left.filteredRowCount === right.filteredRowCount &&
        left.allFilteredRowsSelected === right.allFilteredRowsSelected &&
        areGridPageRowsEqual(left.rows, right.rows)
    );
}

export function areGridSummaryByColumnKeyEqual(
    left: GridSummaryByColumnKey,
    right: GridSummaryByColumnKey,
): boolean {
    if (left === right) return true;

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key, index) => {
        const rightKey = rightKeys[index];
        const leftValue = left[key];
        const rightValue = right[rightKey];
        return (
            key === rightKey &&
            leftValue?.sum === rightValue?.sum &&
            leftValue?.avg === rightValue?.avg
        );
    });
}
