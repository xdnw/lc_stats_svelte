import type { ScopeSnapshot, AavaScopeSnapshot } from "./kpi";
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

export function buildCompositeContextCacheKey(
    signature: string,
    selectedAllianceId: number,
    conflictDataVersion: string,
): CompositeContextCacheKey {
    return `${signature}|aid:${selectedAllianceId}|v:${String(conflictDataVersion)}`;
}