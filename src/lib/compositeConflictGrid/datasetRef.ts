import { getConflictDataUrl } from "../runtime";
import type {
    CompositeConflictGridDatasetRef,
    CompositeConflictGridSourceConflict,
} from "./protocol";

export function createCompositeConflictGridSourceConflicts(
    conflictIds: string[],
    version: string,
): CompositeConflictGridSourceConflict[] {
    return conflictIds.map((id) => ({
        id,
        url: getConflictDataUrl(id, version),
    }));
}

export function createCompositeConflictGridDatasetRef(options: {
    signature: string;
    conflictIds: string[];
    selectedAllianceId: number;
    version: string;
}): CompositeConflictGridDatasetRef {
    return {
        datasetKey: `composite-grid:${options.signature}:aid:${options.selectedAllianceId}:v${options.version}`,
        signature: options.signature,
        conflicts: createCompositeConflictGridSourceConflicts(
            options.conflictIds,
            options.version,
        ),
        selectedAllianceId: options.selectedAllianceId,
        version: options.version,
    };
}
