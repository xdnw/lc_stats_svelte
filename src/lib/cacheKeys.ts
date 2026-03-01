import type { ScopeSnapshot, AavaScopeSnapshot } from "./kpi";
import type { ConflictTableLayoutInput } from "./conflictLayoutCache";
import type { CompositeContextCacheKey } from "./compositeContextCache";

export type AavaSnapshot = Pick<AavaScopeSnapshot, "header" | "primaryIds" | "vsIds"> & {
    primaryCoalitionIndex?: 0 | 1;
};

export function buildScopeSnapshotKey(snapshot?: ScopeSnapshot): string {
    if (!snapshot) return "-";
    const allianceIds = snapshot.allianceIds?.join(".") ?? "";
    const nationIds = snapshot.nationIds?.join(".") ?? "";
    return `${allianceIds}|${nationIds}`;
}

export function buildAavaSnapshotKey(snapshot: AavaSnapshot): string {
    return `${snapshot.header}|${snapshot.primaryCoalitionIndex === 1 ? 1 : 0}|${snapshot.primaryIds.join(".")}|${snapshot.vsIds.join(".")}`;
}

export function buildConflictLayoutInputKey(input: ConflictTableLayoutInput): string {
    return [input.layout, input.sort, input.order, input.columns.join(".")].join("|");
}

export function buildConflictLayoutCacheKey(
    sourceKey: string,
    input: ConflictTableLayoutInput,
): string {
    return `${sourceKey}|${buildConflictLayoutInputKey(input)}`;
}

export function buildCompositeContextCacheKey(
    signature: string,
    selectedAllianceId: number,
    conflictDataVersion: string,
): CompositeContextCacheKey {
    return `${signature}|aid:${selectedAllianceId}|v:${String(conflictDataVersion)}`;
}