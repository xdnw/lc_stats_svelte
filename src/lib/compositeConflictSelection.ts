import { formatAllianceName } from "./formatting";
import type { Conflict } from "./types";

export type LoadedCompositeConflict = {
    id: string;
    data: Conflict;
};

export type CompositeAllianceOption = {
    id: number;
    name: string;
};

export function collectCompositeAllianceCandidates(
    conflicts: LoadedCompositeConflict[],
    orderedConflictIds: string[],
): CompositeAllianceOption[] {
    if (conflicts.length === 0) return [];

    const idSets = conflicts.map((entry) => {
        const ids = [
            ...entry.data.coalitions[0].alliance_ids,
            ...entry.data.coalitions[1].alliance_ids,
        ].map((id) => Number(id));
        return new Set<number>(ids);
    });

    const [first, ...rest] = idSets;
    const commonIds = Array.from(first).filter((id) =>
        rest.every((set) => set.has(id)),
    );

    const nameById = new Map<number, string>();
    for (const entry of conflicts) {
        for (const coalition of entry.data.coalitions) {
            for (let index = 0; index < coalition.alliance_ids.length; index += 1) {
                const id = Number(coalition.alliance_ids[index]);
                if (!Number.isFinite(id) || nameById.has(id)) continue;
                nameById.set(
                    id,
                    String(coalition.alliance_names[index] ?? `Alliance ${id}`),
                );
            }
        }
    }

    const commonIdSet = new Set(commonIds);
    const conflictById = new Map(conflicts.map((entry) => [entry.id, entry]));
    const priorityById = new Map<number, number>();
    let order = 0;
    for (const conflictId of orderedConflictIds) {
        const conflict = conflictById.get(conflictId);
        if (!conflict) continue;
        for (const coalition of conflict.data.coalitions) {
            for (const allianceId of coalition.alliance_ids) {
                const id = Number(allianceId);
                if (!commonIdSet.has(id) || priorityById.has(id)) continue;
                priorityById.set(id, order);
                order += 1;
            }
        }
    }

    return commonIds
        .map((id) => ({ id, name: formatAllianceName(nameById.get(id), id) }))
        .sort((left, right) => {
            const leftPriority = priorityById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
            const rightPriority = priorityById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;
            return left.name.localeCompare(right.name);
        });
}

export function selectDefaultCompositeAllianceId(
    options: CompositeAllianceOption[],
    conflicts: LoadedCompositeConflict[],
    orderedConflictIds: string[],
): number | null {
    if (options.length === 0) return null;

    const optionIds = new Set(options.map((option) => option.id));
    const conflictById = new Map(conflicts.map((entry) => [entry.id, entry]));

    for (const conflictId of orderedConflictIds) {
        const conflict = conflictById.get(conflictId);
        if (!conflict) continue;
        for (const coalition of conflict.data.coalitions) {
            for (const allianceId of coalition.alliance_ids) {
                const id = Number(allianceId);
                if (optionIds.has(id)) {
                    return id;
                }
            }
        }
    }

    return options[0]?.id ?? null;
}

export function buildNoCommonCompositeAllianceDetails(
    conflicts: LoadedCompositeConflict[],
): string[] {
    if (conflicts.length === 0) return [];

    const allianceNameById = new Map<number, string>();
    const allianceConflictIds = new Map<number, Set<string>>();

    for (const entry of conflicts) {
        const allianceIds = new Set<number>();
        for (const coalition of entry.data.coalitions) {
            for (let index = 0; index < coalition.alliance_ids.length; index += 1) {
                const allianceId = Number(coalition.alliance_ids[index]);
                if (!Number.isFinite(allianceId)) continue;
                allianceIds.add(allianceId);
                if (!allianceNameById.has(allianceId)) {
                    allianceNameById.set(
                        allianceId,
                        formatAllianceName(
                            String(
                                coalition.alliance_names[index] ??
                                    `Alliance ${allianceId}`,
                            ),
                            allianceId,
                        ),
                    );
                }
            }
        }

        for (const allianceId of allianceIds) {
            if (!allianceConflictIds.has(allianceId)) {
                allianceConflictIds.set(allianceId, new Set<string>());
            }
            allianceConflictIds.get(allianceId)?.add(entry.id);
        }
    }

    const details: string[] = [];
    const conflictLabel = conflicts
        .map((entry) => `${entry.id} (${entry.data.name || "Unnamed"})`)
        .join(", ");
    details.push(`Selected conflicts: ${conflictLabel}`);

    const total = conflicts.length;
    const nearMatches = Array.from(allianceConflictIds.entries())
        .map(([allianceId, conflictIds]) => ({
            allianceId,
            name: allianceNameById.get(allianceId) ?? `Alliance ${allianceId}`,
            presentIn: conflictIds,
            count: conflictIds.size,
        }))
        .filter((entry) => entry.count > 1)
        .sort((left, right) => {
            if (left.count !== right.count) return right.count - left.count;
            return left.name.localeCompare(right.name);
        })
        .slice(0, 6);

    if (nearMatches.length === 0) {
        details.push("No alliance appears in more than one loaded conflict.");
        return details;
    }

    details.push(`Closest overlaps across ${total} conflicts:`);
    for (const entry of nearMatches) {
        const missing = conflicts
            .map((conflict) => conflict.id)
            .filter((id) => !entry.presentIn.has(id));
        details.push(
            `${entry.name} (${entry.allianceId}) appears in ${entry.count}/${total}; missing from: ${missing.join(", ")}`,
        );
    }

    return details;
}
