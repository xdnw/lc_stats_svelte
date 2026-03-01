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
    compatibilityNotes: string[];
    headerReconciliationWarnings: string[];
    warWebReconciliationWarnings: string[];
    sideOverlapAllianceIds: number[];
    aavaCapable: boolean;
    aavaIncompatibilities: string[];
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
    source: Conflict;
    friendly: any;
    enemy: any;
    selectedAllianceSide: 0 | 1;
};

type HeaderUnion = {
    damageHeader: string[];
    headerType: number[];
    indicesByConflictId: Map<string, number[]>;
    warnings: string[];
};

type WarWebHeaderUnion = {
    headers: string[];
    indicesByConflictId: Map<string, number[]>;
    warnings: string[];
};

type MergedWarWebResult = {
    headers: string[];
    data: number[][][];
    warnings: string[];
    incompatibilities: string[];
    sideOverlapAllianceIds: number[];
    aavaCapable: boolean;
};

function cloneMetricArray(values: unknown, expectedLength: number, context: string[]): number[] {
    if (!Array.isArray(values)) {
        throw new CompositeMergeError("Malformed payload: metric array is missing.", context);
    }
    if (values.length !== expectedLength) {
        throw new CompositeMergeError(
            "Malformed payload: metric array length mismatch.",
            [...context, `Expected ${expectedLength}, got ${values.length}`],
        );
    }
    return values.map((value) => Number(value) || 0);
}

function remapMetricArray(values: number[], indexMap: number[]): number[] {
    const remapped = new Array(indexMap.length).fill(0);
    for (let i = 0; i < indexMap.length; i += 1) {
        const sourceIndex = indexMap[i];
        if (sourceIndex >= 0 && sourceIndex < values.length) {
            remapped[i] = values[sourceIndex] ?? 0;
        }
    }
    return remapped;
}

function addRemappedMetricArray(target: number[], source: number[], indexMap: number[]): void {
    if (target.length !== indexMap.length) {
        throw new CompositeMergeError(
            "Malformed payload: cannot merge remapped metric arrays with different lengths.",
        );
    }

    for (let i = 0; i < indexMap.length; i += 1) {
        const sourceIndex = indexMap[i];
        if (sourceIndex >= 0 && sourceIndex < source.length) {
            target[i] += source[sourceIndex] ?? 0;
        }
    }
}

function compareConflictIdsDescending(left: string, right: string): number {
    const leftAsNumber = Number(left);
    const rightAsNumber = Number(right);
    const leftIsNumeric = Number.isFinite(leftAsNumber);
    const rightIsNumeric = Number.isFinite(rightAsNumber);

    if (leftIsNumeric && rightIsNumeric) {
        return rightAsNumber - leftAsNumber;
    }
    if (leftIsNumeric && !rightIsNumeric) return -1;
    if (!leftIsNumeric && rightIsNumeric) return 1;
    return right.localeCompare(left);
}

function sortConflictsByIdDescending(conflicts: CompositeConflictInput[]): CompositeConflictInput[] {
    return [...conflicts].sort((left, right) => compareConflictIdsDescending(left.id, right.id));
}

function normalizeHeaderLabel(conflictId: string, header: unknown, index: number, warnings: string[]): string {
    const text = String(header ?? "").trim();
    if (text.length > 0) return text;
    const fallback = `metric_${index + 1}`;
    warnings.push(`Conflict ${conflictId} has an empty damage header at index ${index}; using "${fallback}".`);
    return fallback;
}

function buildConflictHeaderMaps(
    conflict: CompositeConflictInput,
    warnings: string[],
): { names: string[]; indexByName: Map<string, number> } {
    if (!Array.isArray(conflict.data.damage_header) || conflict.data.damage_header.length === 0) {
        throw new CompositeMergeError("Malformed payload: missing damage headers.", [
            `Conflict ${conflict.id}: damage_header is missing or empty.`,
        ]);
    }

    const names: string[] = [];
    const indexByName = new Map<string, number>();
    for (let i = 0; i < conflict.data.damage_header.length; i += 1) {
        const name = normalizeHeaderLabel(conflict.id, conflict.data.damage_header[i], i, warnings);
        if (indexByName.has(name)) {
            const firstIndex = indexByName.get(name);
            warnings.push(
                `Conflict ${conflict.id} has duplicate damage header "${name}" at index ${i}; keeping first occurrence at index ${firstIndex} and skipping duplicate.`,
            );
            continue;
        }
        indexByName.set(name, i);
        names.push(name);
    }

    return { names, indexByName };
}

function reconcileHeaders(conflicts: CompositeConflictInput[]): HeaderUnion {
    const warnings: string[] = [];
    const perConflict = new Map<string, { names: string[]; indexByName: Map<string, number> }>();

    const unionHeaders: string[] = [];
    const unionTypes: number[] = [];
    const unionIndexByName = new Map<string, number>();

    for (const conflict of conflicts) {
        const mapped = buildConflictHeaderMaps(conflict, warnings);
        perConflict.set(conflict.id, mapped);

        for (let i = 0; i < mapped.names.length; i += 1) {
            const name = mapped.names[i];
            const existingIndex = unionIndexByName.get(name);
            const rawLocalType = Array.isArray(conflict.data.header_type)
                ? Number(conflict.data.header_type[i])
                : Number.NaN;
            const localType = Number.isFinite(rawLocalType) ? rawLocalType : undefined;

            if (existingIndex == null) {
                unionIndexByName.set(name, unionHeaders.length);
                unionHeaders.push(name);
                unionTypes.push(localType ?? 0);
                continue;
            }

            const existingType = unionTypes[existingIndex];
            if (existingType === 0 && localType != null) {
                unionTypes[existingIndex] = localType;
            } else if (localType != null && existingType !== localType) {
                warnings.push(
                    `Conflict ${conflict.id} has a different header_type for "${name}" (${String(localType)} vs ${String(existingType)}).`,
                );
            }
        }
    }

    const indicesByConflictId = new Map<string, number[]>();
    for (const conflict of conflicts) {
        const mapped = perConflict.get(conflict.id);
        if (!mapped) {
            throw new CompositeMergeError("Malformed payload: missing header mapping state.", [
                `Conflict ${conflict.id}: internal header reconciliation state was not created.`,
            ]);
        }

        const missingHeaders: string[] = [];
        const indexMap = new Array<number>(unionHeaders.length);
        for (let i = 0; i < unionHeaders.length; i += 1) {
            const header = unionHeaders[i];
            const mappedIndex = mapped.indexByName.get(header);
            if (mappedIndex == null) {
                missingHeaders.push(header);
                indexMap[i] = -1;
            } else {
                indexMap[i] = mappedIndex;
            }
        }
        if (missingHeaders.length > 0) {
            warnings.push(
                `Conflict ${conflict.id} is missing headers [${missingHeaders.join(", ")}]; missing metrics were padded with 0.`,
            );
        }
        indicesByConflictId.set(conflict.id, indexMap);
    }

    return {
        damageHeader: unionHeaders,
        headerType: unionTypes,
        indicesByConflictId,
        warnings,
    };
}

function buildWarWebHeaderMaps(
    conflict: CompositeConflictInput,
    warnings: string[],
): { names: string[]; indexByName: Map<string, number> } {
    const rawHeaders = conflict.data?.war_web?.headers;
    if (!Array.isArray(rawHeaders)) {
        warnings.push(
            `Conflict ${conflict.id} has no war_web.headers array; war-web contribution is skipped.`,
        );
        return { names: [], indexByName: new Map() };
    }

    const names: string[] = [];
    const indexByName = new Map<string, number>();
    for (let i = 0; i < rawHeaders.length; i += 1) {
        const name = normalizeHeaderLabel(conflict.id, rawHeaders[i], i, warnings);
        if (indexByName.has(name)) {
            warnings.push(
                `Conflict ${conflict.id} has duplicate war_web header "${name}" at index ${i}; keeping first occurrence and skipping duplicate.`,
            );
            continue;
        }
        indexByName.set(name, i);
        names.push(name);
    }

    return { names, indexByName };
}

function reconcileWarWebHeaders(conflicts: CompositeConflictInput[]): WarWebHeaderUnion {
    const warnings: string[] = [];
    const perConflict = new Map<string, { names: string[]; indexByName: Map<string, number> }>();

    const unionHeaders: string[] = [];
    const unionIndexByName = new Map<string, number>();

    for (const conflict of conflicts) {
        const mapped = buildWarWebHeaderMaps(conflict, warnings);
        perConflict.set(conflict.id, mapped);

        for (const name of mapped.names) {
            if (unionIndexByName.has(name)) continue;
            unionIndexByName.set(name, unionHeaders.length);
            unionHeaders.push(name);
        }
    }

    const indicesByConflictId = new Map<string, number[]>();
    for (const conflict of conflicts) {
        const mapped = perConflict.get(conflict.id);
        if (!mapped) {
            warnings.push(
                `Conflict ${conflict.id} is missing internal war-web header mapping state; war-web contribution is skipped.`,
            );
            indicesByConflictId.set(conflict.id, unionHeaders.map(() => -1));
            continue;
        }

        const missingHeaders: string[] = [];
        const indexMap = new Array<number>(unionHeaders.length);
        for (let i = 0; i < unionHeaders.length; i += 1) {
            const header = unionHeaders[i];
            const mappedIndex = mapped.indexByName.get(header);
            if (mappedIndex == null) {
                missingHeaders.push(header);
                indexMap[i] = -1;
            } else {
                indexMap[i] = mappedIndex;
            }
        }
        if (missingHeaders.length > 0) {
            warnings.push(
                `Conflict ${conflict.id} is missing war_web headers [${missingHeaders.join(", ")}]; missing matrices were padded with 0.`,
            );
        }
        indicesByConflictId.set(conflict.id, indexMap);
    }

    return {
        headers: unionHeaders,
        indicesByConflictId,
        warnings,
    };
}

function buildSideAllianceIndex(
    friendlyAccumulator: CoalitionAccumulator,
    enemyAccumulator: CoalitionAccumulator,
): {
    friendlyIds: number[];
    enemyIds: number[];
    friendlyIndexByAllianceId: Map<number, number>;
    enemyIndexByAllianceId: Map<number, number>;
    sideOverlapAllianceIds: number[];
} {
    const friendlyIds = Array.from(friendlyAccumulator.allianceById.keys()).sort((left, right) => left - right);
    const enemyIds = Array.from(enemyAccumulator.allianceById.keys()).sort((left, right) => left - right);

    const friendlyIndexByAllianceId = new Map<number, number>();
    const enemyIndexByAllianceId = new Map<number, number>();

    for (let i = 0; i < friendlyIds.length; i += 1) {
        friendlyIndexByAllianceId.set(friendlyIds[i], i);
    }
    for (let i = 0; i < enemyIds.length; i += 1) {
        enemyIndexByAllianceId.set(enemyIds[i], friendlyIds.length + i);
    }

    const enemyIdSet = new Set(enemyIds);
    const sideOverlapAllianceIds = friendlyIds.filter((id) => enemyIdSet.has(id));

    return {
        friendlyIds,
        enemyIds,
        friendlyIndexByAllianceId,
        enemyIndexByAllianceId,
        sideOverlapAllianceIds,
    };
}

function normalizeWarWebMatrix(raw: unknown, expectedSize: number): number[][] | null {
    if (!Array.isArray(raw) || raw.length !== expectedSize) return null;
    const normalized = new Array(expectedSize);
    for (let row = 0; row < expectedSize; row += 1) {
        const rowValues = raw[row];
        if (!Array.isArray(rowValues) || rowValues.length !== expectedSize) {
            return null;
        }
        normalized[row] = rowValues.map((value) => Number(value) || 0);
    }
    return normalized;
}

function mergeWarWeb(
    normalizedConflicts: NormalizedConflict[],
    sortedConflicts: CompositeConflictInput[],
    friendlyAccumulator: CoalitionAccumulator,
    enemyAccumulator: CoalitionAccumulator,
): MergedWarWebResult {
    const warnings: string[] = [];
    const incompatibilities: string[] = [];
    const headers = reconcileWarWebHeaders(sortedConflicts);
    warnings.push(...headers.warnings);

    const sideIndex = buildSideAllianceIndex(friendlyAccumulator, enemyAccumulator);
    if (sideIndex.sideOverlapAllianceIds.length > 0) {
        warnings.push(
            `Alliances [${sideIndex.sideOverlapAllianceIds.join(", ")}] appear on both merged sides and are represented as side-specific nodes in war-web matrices.`,
        );
    }

    if (headers.headers.length === 0) {
        incompatibilities.push(
            "No merged war-web headers are available for AAvA/chord rendering.",
        );
        return {
            headers: [],
            data: [],
            warnings,
            incompatibilities,
            sideOverlapAllianceIds: sideIndex.sideOverlapAllianceIds,
            aavaCapable: false,
        };
    }

    const mergedSize = sideIndex.friendlyIds.length + sideIndex.enemyIds.length;
    if (mergedSize === 0) {
        incompatibilities.push("Merged war-web contains no alliances.");
        return {
            headers: headers.headers,
            data: headers.headers.map(() => []),
            warnings,
            incompatibilities,
            sideOverlapAllianceIds: sideIndex.sideOverlapAllianceIds,
            aavaCapable: false,
        };
    }

    const mergedData: number[][][] = headers.headers.map(() =>
        Array.from({ length: mergedSize }, () => new Array(mergedSize).fill(0)),
    );

    const normalizedById = new Map(normalizedConflicts.map((item) => [item.id, item]));
    let mergedSourceMatrixCount = 0;

    for (const conflict of sortedConflicts) {
        const normalized = normalizedById.get(conflict.id);
        if (!normalized) continue;

        const friendlyAllianceIds = Array.isArray(normalized.friendly?.alliance_ids)
            ? normalized.friendly.alliance_ids.map((id: unknown) => Number(id))
            : [];
        const enemyAllianceIds = Array.isArray(normalized.enemy?.alliance_ids)
            ? normalized.enemy.alliance_ids.map((id: unknown) => Number(id))
            : [];
        const localAllianceIds = [...friendlyAllianceIds, ...enemyAllianceIds];

        if (localAllianceIds.length === 0) {
            warnings.push(`Conflict ${conflict.id} has no war-web alliance ids; contribution was skipped.`);
            continue;
        }

        const localToMergedIndex = new Array(localAllianceIds.length).fill(-1);
        for (let i = 0; i < localAllianceIds.length; i += 1) {
            const allianceId = localAllianceIds[i];
            const mergedIndex = i < friendlyAllianceIds.length
                ? sideIndex.friendlyIndexByAllianceId.get(allianceId)
                : sideIndex.enemyIndexByAllianceId.get(allianceId);

            if (mergedIndex == null) {
                warnings.push(
                    `Conflict ${conflict.id} includes alliance ${allianceId} that is missing from merged side index; war-web values for this alliance were skipped.`,
                );
                continue;
            }
            localToMergedIndex[i] = mergedIndex;
        }

        const warWebData = normalized.source?.war_web?.data;
        if (!Array.isArray(warWebData)) {
            warnings.push(`Conflict ${conflict.id} has no war_web.data array; contribution was skipped.`);
            continue;
        }

        const headerIndexMap = headers.indicesByConflictId.get(conflict.id);
        if (!headerIndexMap) {
            warnings.push(`Conflict ${conflict.id} has no war-web header index map; contribution was skipped.`);
            continue;
        }

        for (let mergedHeaderIndex = 0; mergedHeaderIndex < headers.headers.length; mergedHeaderIndex += 1) {
            const localHeaderIndex = headerIndexMap[mergedHeaderIndex] ?? -1;
            if (localHeaderIndex < 0) continue;

            const normalizedMatrix = normalizeWarWebMatrix(
                warWebData[localHeaderIndex],
                localAllianceIds.length,
            );
            if (!normalizedMatrix) {
                warnings.push(
                    `Conflict ${conflict.id} has malformed war-web matrix for header "${headers.headers[mergedHeaderIndex]}"; contribution was skipped.`,
                );
                continue;
            }

            mergedSourceMatrixCount += 1;
            const targetMatrix = mergedData[mergedHeaderIndex];
            for (let row = 0; row < normalizedMatrix.length; row += 1) {
                const targetRow = localToMergedIndex[row];
                if (targetRow < 0) continue;
                for (let col = 0; col < normalizedMatrix[row].length; col += 1) {
                    const targetCol = localToMergedIndex[col];
                    if (targetCol < 0) continue;
                    targetMatrix[targetRow][targetCol] += normalizedMatrix[row][col];
                }
            }
        }
    }

    if (mergedSourceMatrixCount === 0) {
        incompatibilities.push(
            "Merged war-web matrices could not be constructed from the selected conflicts.",
        );
    }

    return {
        headers: headers.headers,
        data: mergedData,
        warnings,
        incompatibilities,
        sideOverlapAllianceIds: sideIndex.sideOverlapAllianceIds,
        aavaCapable: mergedSourceMatrixCount > 0,
    };
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
        source: data,
        friendly: inCoalition1 ? coalition1 : coalition2,
        enemy: inCoalition1 ? coalition2 : coalition1,
        selectedAllianceSide: inCoalition1 ? 0 : 1,
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
    context: { conflictId: string; coalitionLabel: string },
): {
    coalitionTaken: number[];
    coalitionDealt: number[];
    alliances: Array<{ id: number; name: string; taken: number[]; dealt: number[] }>;
    nations: Array<{ id: number; name: string; allianceId: number; taken: number[]; dealt: number[] }>;
} {
    if (!Array.isArray(coalition.damage) || coalition.damage.length < 2) {
        throw new CompositeMergeError("Malformed payload: coalition damage arrays are missing.", [
            `Conflict ${context.conflictId} (${context.coalitionLabel}): damage array is missing or too short.`,
        ]);
    }

    const coalitionTaken = cloneMetricArray(coalition.damage[0], expectedMetricCount, [
        `Conflict ${context.conflictId} (${context.coalitionLabel}): coalition damage taken is invalid.`,
    ]);
    const coalitionDealt = cloneMetricArray(coalition.damage[1], expectedMetricCount, [
        `Conflict ${context.conflictId} (${context.coalitionLabel}): coalition damage dealt is invalid.`,
    ]);

    const alliances: Array<{ id: number; name: string; taken: number[]; dealt: number[] }> = [];
    for (let i = 0; i < coalition.alliance_ids.length; i += 1) {
        const baseIndex = 2 + i * 2;
        alliances.push({
            id: Number(coalition.alliance_ids[i]),
            name: String(coalition.alliance_names[i] ?? `Alliance ${coalition.alliance_ids[i]}`),
            taken: cloneMetricArray(coalition.damage[baseIndex], expectedMetricCount, [
                `Conflict ${context.conflictId} (${context.coalitionLabel}): alliance ${coalition.alliance_ids[i]} damage taken is invalid.`,
            ]),
            dealt: cloneMetricArray(coalition.damage[baseIndex + 1], expectedMetricCount, [
                `Conflict ${context.conflictId} (${context.coalitionLabel}): alliance ${coalition.alliance_ids[i]} damage dealt is invalid.`,
            ]),
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
            taken: cloneMetricArray(coalition.damage[baseIndex], expectedMetricCount, [
                `Conflict ${context.conflictId} (${context.coalitionLabel}): nation ${coalition.nation_ids[i]} damage taken is invalid.`,
            ]),
            dealt: cloneMetricArray(coalition.damage[baseIndex + 1], expectedMetricCount, [
                `Conflict ${context.conflictId} (${context.coalitionLabel}): nation ${coalition.nation_ids[i]} damage dealt is invalid.`,
            ]),
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
    conflictId: string,
    coalition: any,
    accumulator: CoalitionAccumulator,
    localMetricCount: number,
    headerIndexMap: number[],
    warnings: string[],
): void {
    const extracted = readEntityDamage(coalition, localMetricCount, {
        conflictId,
        coalitionLabel: accumulator.name,
    });

    addRemappedMetricArray(
        accumulator.coalitionDamageTaken,
        extracted.coalitionTaken,
        headerIndexMap,
    );
    addRemappedMetricArray(
        accumulator.coalitionDamageDealt,
        extracted.coalitionDealt,
        headerIndexMap,
    );

    for (const alliance of extracted.alliances) {
        const existing = accumulator.allianceById.get(alliance.id);
        if (!existing) {
            accumulator.allianceById.set(alliance.id, {
                name: alliance.name,
                damageTaken: remapMetricArray(alliance.taken, headerIndexMap),
                damageDealt: remapMetricArray(alliance.dealt, headerIndexMap),
            });
            continue;
        }

        if (existing.name !== alliance.name) {
            warnings.push(
                `Alliance ${alliance.id} has inconsistent names: "${existing.name}" vs "${alliance.name}".`,
            );
        }
        addRemappedMetricArray(existing.damageTaken, alliance.taken, headerIndexMap);
        addRemappedMetricArray(existing.damageDealt, alliance.dealt, headerIndexMap);
    }

    for (const nation of extracted.nations) {
        const existing = accumulator.nationById.get(nation.id);
        if (!existing) {
            accumulator.nationById.set(nation.id, {
                name: nation.name,
                allianceId: nation.allianceId,
                damageTaken: remapMetricArray(nation.taken, headerIndexMap),
                damageDealt: remapMetricArray(nation.dealt, headerIndexMap),
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
        addRemappedMetricArray(existing.damageTaken, nation.taken, headerIndexMap);
        addRemappedMetricArray(existing.damageDealt, nation.dealt, headerIndexMap);
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

    const sortedConflicts = sortConflictsByIdDescending(conflicts);

    const warnings: string[] = [];
    const compatibilityNotes: string[] = [];
    const normalized: NormalizedConflict[] = [];
    const incompatibleConflicts: string[] = [];

    for (const conflict of sortedConflicts) {
        try {
            const normalizedConflict = normalizeConflict(conflict, selectedAllianceId);
            normalized.push(normalizedConflict);
            compatibilityNotes.push(
                `Conflict ${conflict.id}: selected alliance ${selectedAllianceId} is on coalition ${normalizedConflict.selectedAllianceSide + 1}.`,
            );
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

    const headers = reconcileHeaders(sortedConflicts);
    warnings.push(...headers.warnings);
    const metricCount = headers.damageHeader.length;

    const selectedAllianceName = extractSelectedAllianceName(normalized, selectedAllianceId);
    const friendlyAccumulator = createAccumulator(`Allies (${selectedAllianceName} side)`, metricCount);
    const enemyAccumulator = createAccumulator("Enemy", metricCount);

    let minStart = Number.MAX_SAFE_INTEGER;
    let maxEnd = 0;
    let ongoing = false;

    for (const item of normalized) {
        const localMetricCount = Array.isArray(item.source.damage_header)
            ? item.source.damage_header.length
            : 0;
        const headerIndexMap = headers.indicesByConflictId.get(item.id);
        if (!headerIndexMap) {
            throw new CompositeMergeError("Malformed payload: missing header index map.", [
                `Conflict ${item.id}: header reconciliation index map was not found.`,
            ]);
        }

        mergeCoalitionIntoAccumulator(item.id, item.friendly, friendlyAccumulator, localMetricCount, headerIndexMap, warnings);
        mergeCoalitionIntoAccumulator(item.id, item.enemy, enemyAccumulator, localMetricCount, headerIndexMap, warnings);

        minStart = Math.min(minStart, item.source.start);
        if (item.source.end === -1) {
            ongoing = true;
        } else {
            maxEnd = Math.max(maxEnd, item.source.end);
        }
    }

    const mergedWarWeb = mergeWarWeb(
        normalized,
        sortedConflicts,
        friendlyAccumulator,
        enemyAccumulator,
    );
    warnings.push(...mergedWarWeb.warnings);

    const mergedConflict: Conflict = {
        name: `Composite (${normalized.length}) · ${selectedAllianceName}`,
        wiki: "",
        start: minStart === Number.MAX_SAFE_INTEGER ? Date.now() : minStart,
        end: ongoing ? -1 : maxEnd,
        cb: "Composite merge",
        status: "Composite",
        posts: {},
        coalitions: [toCoalitionPayload(friendlyAccumulator), toCoalitionPayload(enemyAccumulator)],
        damage_header: [...headers.damageHeader],
        header_type: [...headers.headerType],
        war_web: {
            headers: [...mergedWarWeb.headers],
            data: [...mergedWarWeb.data] as unknown as [][][],
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
            compatibilityNotes,
            headerReconciliationWarnings: [...headers.warnings],
            warWebReconciliationWarnings: [...mergedWarWeb.warnings],
            sideOverlapAllianceIds: [...mergedWarWeb.sideOverlapAllianceIds],
            aavaCapable: mergedWarWeb.aavaCapable,
            aavaIncompatibilities: [...mergedWarWeb.incompatibilities],
        },
    };
}

export function isCompositeMergeError(error: unknown): error is CompositeMergeError {
    return error instanceof CompositeMergeError;
}
