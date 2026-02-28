import type { Conflict } from "$lib/types";

export type CompositeConflictInput = {
    id: string;
    data: Conflict;
};

export type CompositeMergeDiagnostics = {
    mergedConflictIds: string[];
    selectedAllianceId: number;
    selectedAllianceName: string;
    warnings: string[];
};

export type CompositeMergeResult = {
    conflict: Conflict;
    diagnostics: CompositeMergeDiagnostics;
};

class CompositeMergeError extends Error {
    readonly details?: string[];

    constructor(message: string, details?: string[]) {
        super(message);
        this.name = "CompositeMergeError";
        this.details = details;
    }
}

type CoalitionAccumulator = {
    name: string;
    allianceById: Map<number, { name: string; damageTaken: number[]; damageDealt: number[] }>;
    nationById: Map<number, { name: string; allianceId: number; damageTaken: number[]; damageDealt: number[] }>;
    coalitionDamageTaken: number[];
    coalitionDamageDealt: number[];
};

type NormalizedConflict = {
    id: string;
    friendly: any;
    enemy: any;
};

function cloneMetricArray(values: unknown, expectedLength: number): number[] {
    if (!Array.isArray(values)) {
        throw new CompositeMergeError("Malformed payload: metric array is missing.");
    }
    if (values.length !== expectedLength) {
        throw new CompositeMergeError(
            "Malformed payload: metric array length mismatch.",
            [`Expected ${expectedLength}, got ${values.length}`],
        );
    }
    return values.map((value) => Number(value) || 0);
}

function addMetricArrays(target: number[], source: number[]): void {
    if (target.length !== source.length) {
        throw new CompositeMergeError(
            "Malformed payload: cannot merge metric arrays with different lengths.",
        );
    }
    for (let i = 0; i < target.length; i += 1) {
        target[i] += source[i];
    }
}

function normalizeConflict(
    input: CompositeConflictInput,
    selectedAllianceId: number,
): NormalizedConflict {
    const { id, data } = input;
    if (!data || !Array.isArray(data.coalitions) || data.coalitions.length !== 2) {
        throw new CompositeMergeError(
            "Malformed payload: each conflict must have exactly two coalitions.",
            [id],
        );
    }

    const [coalition1, coalition2] = data.coalitions;
    const inCoalition1 = coalition1.alliance_ids.includes(selectedAllianceId);
    const inCoalition2 = coalition2.alliance_ids.includes(selectedAllianceId);

    if (inCoalition1 && inCoalition2) {
        throw new CompositeMergeError(
            "Malformed payload: selected alliance appears on both sides.",
            [id],
        );
    }

    if (!inCoalition1 && !inCoalition2) {
        throw new CompositeMergeError(
            "Selected alliance is not present in every conflict.",
            [id],
        );
    }

    return {
        id,
        friendly: inCoalition1 ? coalition1 : coalition2,
        enemy: inCoalition1 ? coalition2 : coalition1,
    };
}

function extractSelectedAllianceName(
    normalizedConflicts: NormalizedConflict[],
    selectedAllianceId: number,
): string {
    for (const normalized of normalizedConflicts) {
        const idx = normalized.friendly.alliance_ids.indexOf(selectedAllianceId);
        if (idx >= 0) {
            return normalized.friendly.alliance_names[idx] || `Alliance ${selectedAllianceId}`;
        }
    }
    return `Alliance ${selectedAllianceId}`;
}

function createAccumulator(name: string, metricCount: number): CoalitionAccumulator {
    return {
        name,
        allianceById: new Map(),
        nationById: new Map(),
        coalitionDamageTaken: new Array(metricCount).fill(0),
        coalitionDamageDealt: new Array(metricCount).fill(0),
    };
}

function readEntityDamage(
    coalition: any,
    expectedMetricCount: number,
): {
    coalitionTaken: number[];
    coalitionDealt: number[];
    alliances: Array<{ id: number; name: string; taken: number[]; dealt: number[] }>;
    nations: Array<{ id: number; name: string; allianceId: number; taken: number[]; dealt: number[] }>;
} {
    if (!Array.isArray(coalition.damage) || coalition.damage.length < 2) {
        throw new CompositeMergeError("Malformed payload: coalition damage arrays are missing.");
    }

    const coalitionTaken = cloneMetricArray(coalition.damage[0], expectedMetricCount);
    const coalitionDealt = cloneMetricArray(coalition.damage[1], expectedMetricCount);

    const alliances: Array<{ id: number; name: string; taken: number[]; dealt: number[] }> = [];
    for (let i = 0; i < coalition.alliance_ids.length; i += 1) {
        const baseIndex = 2 + i * 2;
        alliances.push({
            id: Number(coalition.alliance_ids[i]),
            name: String(coalition.alliance_names[i] ?? `Alliance ${coalition.alliance_ids[i]}`),
            taken: cloneMetricArray(coalition.damage[baseIndex], expectedMetricCount),
            dealt: cloneMetricArray(coalition.damage[baseIndex + 1], expectedMetricCount),
        });
    }

    const nations: Array<{ id: number; name: string; allianceId: number; taken: number[]; dealt: number[] }> = [];
    const nationOffset = 2 + coalition.alliance_ids.length * 2;
    for (let i = 0; i < coalition.nation_ids.length; i += 1) {
        const baseIndex = nationOffset + i * 2;
        nations.push({
            id: Number(coalition.nation_ids[i]),
            name: String(coalition.nation_names[i] ?? `Nation ${coalition.nation_ids[i]}`),
            allianceId: Number(coalition.nation_aa[i]),
            taken: cloneMetricArray(coalition.damage[baseIndex], expectedMetricCount),
            dealt: cloneMetricArray(coalition.damage[baseIndex + 1], expectedMetricCount),
        });
    }

    return {
        coalitionTaken,
        coalitionDealt,
        alliances,
        nations,
    };
}

function mergeCoalitionIntoAccumulator(
    coalition: any,
    accumulator: CoalitionAccumulator,
    metricCount: number,
    warnings: string[],
): void {
    const extracted = readEntityDamage(coalition, metricCount);

    addMetricArrays(accumulator.coalitionDamageTaken, extracted.coalitionTaken);
    addMetricArrays(accumulator.coalitionDamageDealt, extracted.coalitionDealt);

    for (const alliance of extracted.alliances) {
        const existing = accumulator.allianceById.get(alliance.id);
        if (!existing) {
            accumulator.allianceById.set(alliance.id, {
                name: alliance.name,
                damageTaken: [...alliance.taken],
                damageDealt: [...alliance.dealt],
            });
            continue;
        }

        if (existing.name !== alliance.name) {
            warnings.push(
                `Alliance ${alliance.id} has inconsistent names: "${existing.name}" vs "${alliance.name}".`,
            );
        }
        addMetricArrays(existing.damageTaken, alliance.taken);
        addMetricArrays(existing.damageDealt, alliance.dealt);
    }

    for (const nation of extracted.nations) {
        const existing = accumulator.nationById.get(nation.id);
        if (!existing) {
            accumulator.nationById.set(nation.id, {
                name: nation.name,
                allianceId: nation.allianceId,
                damageTaken: [...nation.taken],
                damageDealt: [...nation.dealt],
            });
            continue;
        }

        if (existing.name !== nation.name) {
            warnings.push(
                `Nation ${nation.id} has inconsistent names: "${existing.name}" vs "${nation.name}".`,
            );
        }
        if (existing.allianceId !== nation.allianceId) {
            warnings.push(
                `Nation ${nation.id} appears under multiple alliances (${existing.allianceId}, ${nation.allianceId}).`,
            );
        }
        addMetricArrays(existing.damageTaken, nation.taken);
        addMetricArrays(existing.damageDealt, nation.dealt);
    }
}

function toCoalitionPayload(accumulator: CoalitionAccumulator): any {
    const allianceEntries = Array.from(accumulator.allianceById.entries())
        .sort((left, right) => left[0] - right[0]);
    const nationEntries = Array.from(accumulator.nationById.entries())
        .sort((left, right) => left[0] - right[0]);

    const allianceIds = allianceEntries.map(([id]) => id);
    const allianceNames = allianceEntries.map(([, entry]) => entry.name);
    const nationIds = nationEntries.map(([id]) => id);
    const nationNames = nationEntries.map(([, entry]) => entry.name);
    const nationAas = nationEntries.map(([, entry]) => entry.allianceId);

    const damage: number[][] = [
        [...accumulator.coalitionDamageTaken],
        [...accumulator.coalitionDamageDealt],
    ];

    for (const [, entry] of allianceEntries) {
        damage.push([...entry.damageTaken], [...entry.damageDealt]);
    }
    for (const [, entry] of nationEntries) {
        damage.push([...entry.damageTaken], [...entry.damageDealt]);
    }

    return {
        name: accumulator.name,
        alliance_ids: allianceIds,
        alliance_names: allianceNames,
        nation_ids: nationIds,
        nation_aa: nationAas,
        nation_names: nationNames,
        counts: [[], []],
        damage,
    };
}

export function mergeCompositeConflict(
    conflicts: CompositeConflictInput[],
    selectedAllianceId: number,
): CompositeMergeResult {
    if (!Number.isFinite(selectedAllianceId) || selectedAllianceId <= 0) {
        throw new CompositeMergeError("Select a valid alliance before building a composite conflict.");
    }
    if (conflicts.length < 2) {
        throw new CompositeMergeError("Select at least two conflicts to build a composite conflict.");
    }

    const warnings: string[] = [];
    const normalized: NormalizedConflict[] = [];
    const incompatibleConflicts: string[] = [];

    for (const conflict of conflicts) {
        try {
            normalized.push(normalizeConflict(conflict, selectedAllianceId));
        } catch (error) {
            if (error instanceof CompositeMergeError && error.details?.length) {
                incompatibleConflicts.push(...error.details);
                continue;
            }
            throw error;
        }
    }

    if (incompatibleConflicts.length > 0) {
        throw new CompositeMergeError(
            "Selected alliance cannot produce a composite conflict for all selected conflicts.",
            incompatibleConflicts,
        );
    }

    if (normalized.length === 0) {
        throw new CompositeMergeError("No conflicts were eligible for composite merge.");
    }

    const first = conflicts[0].data;
    const metricCount = first.damage_header?.length ?? 0;
    if (!Array.isArray(first.damage_header) || metricCount === 0) {
        throw new CompositeMergeError("Malformed payload: missing damage headers.");
    }

    for (const conflict of conflicts.slice(1)) {
        if (
            conflict.data.damage_header.length !== metricCount ||
            conflict.data.damage_header.some((value, idx) => value !== first.damage_header[idx])
        ) {
            throw new CompositeMergeError(
                "Conflicts cannot be merged because damage headers do not match.",
            );
        }
    }

    const selectedAllianceName = extractSelectedAllianceName(normalized, selectedAllianceId);
    const friendlyAccumulator = createAccumulator(`Friendly · ${selectedAllianceName}`, metricCount);
    const enemyAccumulator = createAccumulator("Enemy", metricCount);

    let minStart = Number.MAX_SAFE_INTEGER;
    let maxEnd = 0;
    let ongoing = false;

    for (const item of normalized) {
        mergeCoalitionIntoAccumulator(item.friendly, friendlyAccumulator, metricCount, warnings);
        mergeCoalitionIntoAccumulator(item.enemy, enemyAccumulator, metricCount, warnings);

        const sourceConflict = conflicts.find((conflict) => conflict.id === item.id)?.data;
        if (sourceConflict) {
            minStart = Math.min(minStart, sourceConflict.start);
            if (sourceConflict.end === -1) {
                ongoing = true;
            } else {
                maxEnd = Math.max(maxEnd, sourceConflict.end);
            }
        }
    }

    const mergedConflict: Conflict = {
        name: `Composite (${normalized.length}) · ${selectedAllianceName}`,
        wiki: "",
        start: minStart === Number.MAX_SAFE_INTEGER ? Date.now() : minStart,
        end: ongoing ? -1 : maxEnd,
        cb: "Composite merge",
        status: "Composite",
        posts: {},
        coalitions: [toCoalitionPayload(friendlyAccumulator), toCoalitionPayload(enemyAccumulator)],
        damage_header: [...first.damage_header],
        header_type: [...first.header_type],
        war_web: {
            headers: [],
            data: [],
        },
    };

    const totalFriendlyDealt = friendlyAccumulator.coalitionDamageDealt.reduce((sum, value) => sum + value, 0);
    const totalEnemyTaken = enemyAccumulator.coalitionDamageTaken.reduce((sum, value) => sum + value, 0);
    if (Math.abs(totalFriendlyDealt - totalEnemyTaken) > 0.01) {
        warnings.push("Merged totals indicate non-zero dealt/taken drift between friendly and enemy sides.");
    }

    return {
        conflict: mergedConflict,
        diagnostics: {
            mergedConflictIds: normalized.map((item) => item.id),
            selectedAllianceId,
            selectedAllianceName,
            warnings,
        },
    };
}

export function isCompositeMergeError(error: unknown): error is CompositeMergeError {
    return error instanceof CompositeMergeError;
}
