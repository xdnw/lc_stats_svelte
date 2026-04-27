import { getConflictDataUrl } from "../runtime";
import type {
    CompositeConflictGridDatasetRef,
    CompositeConflictGridSourceConflict,
} from "./protocol";

function normalizeBasePath(basePath?: string): string {
    if (!basePath) return "";
    return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function basePathScopeKey(basePath?: string): string {
    const normalized = normalizeBasePath(basePath);
    return normalized.length > 0 ? encodeURIComponent(normalized) : "root";
}

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
    basePath?: string;
}): CompositeConflictGridDatasetRef {
    const basePath = normalizeBasePath(options.basePath);
    return {
        datasetKey: `composite-grid:${options.signature}:aid:${options.selectedAllianceId}:v${options.version}:base:${basePathScopeKey(basePath)}`,
        signature: options.signature,
        conflicts: createCompositeConflictGridSourceConflicts(
            options.conflictIds,
            options.version,
        ),
        selectedAllianceId: options.selectedAllianceId,
        version: options.version,
        basePath,
    };
}
