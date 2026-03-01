import type { AavaScopeSnapshot, ScopeSnapshot } from "./kpi";

function sanitizeNumericIds(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return values
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isFinite(id));
}

export function sanitizeScopeSnapshot(snapshot: unknown): ScopeSnapshot | undefined {
    if (!snapshot || typeof snapshot !== "object") return undefined;

    const value = snapshot as Partial<ScopeSnapshot>;
    const allianceIds = sanitizeNumericIds(value.allianceIds);
    const nationIds = sanitizeNumericIds(value.nationIds);
    const label =
        typeof value.label === "string" ? value.label : "Selection snapshot";

    return { allianceIds, nationIds, label };
}

export function sanitizeAavaSnapshot(
    snapshot: unknown,
): AavaScopeSnapshot | undefined {
    if (!snapshot || typeof snapshot !== "object") return undefined;

    const value = snapshot as Partial<AavaScopeSnapshot>;
    const primaryCoalitionIndex = value.primaryCoalitionIndex === 1 ? 1 : 0;
    const header = typeof value.header === "string" ? value.header : "wars";
    const label = typeof value.label === "string" ? value.label : "AAvA snapshot";
    const primaryIds = sanitizeNumericIds(value.primaryIds);
    const vsIds = sanitizeNumericIds(value.vsIds);

    return { primaryCoalitionIndex, header, label, primaryIds, vsIds };
}

export function buildSelectionSnapshot(
    selectedAllianceIds: Set<number>,
    selectedNationIds: Set<number>,
): ScopeSnapshot {
    const allianceIds = Array.from(selectedAllianceIds);
    const nationIds = Array.from(selectedNationIds);
    const labelParts: string[] = [];
    if (allianceIds.length > 0) {
        labelParts.push(
            `${allianceIds.length} alliance${allianceIds.length === 1 ? "" : "s"}`,
        );
    }
    if (nationIds.length > 0) {
        labelParts.push(
            `${nationIds.length} nation${nationIds.length === 1 ? "" : "s"}`,
        );
    }
    return {
        allianceIds,
        nationIds,
        label: labelParts.length > 0 ? labelParts.join(" · ") : "No selection",
    };
}