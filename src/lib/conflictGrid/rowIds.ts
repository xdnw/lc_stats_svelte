import type { GridRowId } from "../grid/types";

export const ConflictGridLayout = {
    COALITION: 0,
    ALLIANCE: 1,
    NATION: 2,
} as const;

export type ConflictGridLayoutValue =
    (typeof ConflictGridLayout)[keyof typeof ConflictGridLayout];

export function isConflictGridLayout(
    value: number,
): value is ConflictGridLayoutValue {
    return (
        value === ConflictGridLayout.COALITION ||
        value === ConflictGridLayout.ALLIANCE ||
        value === ConflictGridLayout.NATION
    );
}

export function conflictGridLayoutLabel(
    layout: ConflictGridLayoutValue,
): string {
    if (layout === ConflictGridLayout.ALLIANCE) return "Alliance";
    if (layout === ConflictGridLayout.NATION) return "Nation";
    return "Coalition";
}

export function coalitionRowId(index: number): GridRowId {
    return index;
}

export function allianceRowId(allianceId: number): GridRowId {
    return allianceId;
}

export function nationRowId(nationId: number): GridRowId {
    return nationId;
}
