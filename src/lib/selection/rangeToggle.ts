export type RangeToggleResult<T> = {
    selected: Set<T>;
    anchor: T;
};

export function applyRangeToggle<T>(
    orderedIds: readonly T[],
    selected: ReadonlySet<T>,
    anchor: T | null,
    target: T,
    shiftKey: boolean,
): RangeToggleResult<T> {
    const nextSelected = new Set(selected);
    const targetAlreadySelected = nextSelected.has(target);

    if (shiftKey && anchor != null && orderedIds.length > 0) {
        const anchorIndex = orderedIds.indexOf(anchor);
        const targetIndex = orderedIds.indexOf(target);

        if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
                anchorIndex <= targetIndex
                    ? [anchorIndex, targetIndex]
                    : [targetIndex, anchorIndex];
            const shouldSelect = !targetAlreadySelected;
            for (let index = start; index <= end; index += 1) {
                const id = orderedIds[index];
                if (shouldSelect) nextSelected.add(id);
                else nextSelected.delete(id);
            }

            return {
                selected: nextSelected,
                anchor: target,
            };
        }
    }

    if (targetAlreadySelected) nextSelected.delete(target);
    else nextSelected.add(target);

    return {
        selected: nextSelected,
        anchor: target,
    };
}