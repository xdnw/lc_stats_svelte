export type ConflictTargetFinderMode = "war" | "raid" | "damage" | "spy";

export type ConflictTargetFinderAlliance = {
    id: number;
    name: string;
};

export type ConflictTargetFinderCoalition = {
    label: string;
    name: string;
    alliances: readonly ConflictTargetFinderAlliance[];
};

export type ConflictTargetFinderSelection = {
    side: ConflictTargetFinderCoalition;
    enemy: ConflictTargetFinderCoalition;
    sideAllianceIds: number[];
    enemyAllianceIds: number[];
    sideSelector: string;
    enemySelector: string;
};

function normalizeAllianceIds(allianceIds: readonly number[]): number[] {
    const seen = new Set<number>();
    const normalized: number[] = [];

    for (const allianceId of allianceIds) {
        if (!Number.isFinite(allianceId)) continue;
        const normalizedId = Math.trunc(allianceId);
        if (normalizedId <= 0 || seen.has(normalizedId)) continue;
        seen.add(normalizedId);
        normalized.push(normalizedId);
    }

    return normalized;
}

export function getCoalitionAllianceIds(
    coalition: ConflictTargetFinderCoalition,
): number[] {
    return normalizeAllianceIds(coalition.alliances.map((alliance) => alliance.id));
}

export function buildAllianceSelector(allianceIds: readonly number[]): string {
    return normalizeAllianceIds(allianceIds)
        .map((allianceId) => `AA:${allianceId}`)
        .join(",");
}

export function hasConflictTargetFinderCoalitions(
    coalitions: readonly [
        ConflictTargetFinderCoalition,
        ConflictTargetFinderCoalition,
    ],
): boolean {
    return getCoalitionAllianceIds(coalitions[0]).length > 0 &&
        getCoalitionAllianceIds(coalitions[1]).length > 0;
}

export function resolveConflictTargetFinderSelection(
    coalitions: readonly [
        ConflictTargetFinderCoalition,
        ConflictTargetFinderCoalition,
    ],
    sideIndex: 0 | 1,
): ConflictTargetFinderSelection | null {
    const side = coalitions[sideIndex];
    const enemy = coalitions[sideIndex === 0 ? 1 : 0];
    const sideAllianceIds = getCoalitionAllianceIds(side);
    const enemyAllianceIds = getCoalitionAllianceIds(enemy);
    const sideSelector = buildAllianceSelector(sideAllianceIds);
    const enemySelector = buildAllianceSelector(enemyAllianceIds);

    if (!sideSelector || !enemySelector) {
        return null;
    }

    return {
        side,
        enemy,
        sideAllianceIds,
        enemyAllianceIds,
        sideSelector,
        enemySelector,
    };
}

export function buildConflictTargetFinderUrl(options: {
    mode: ConflictTargetFinderMode;
    sideAllianceIds: readonly number[];
    enemyAllianceIds: readonly number[];
}): string {
    const enemySelector = buildAllianceSelector(options.enemyAllianceIds);

    if (options.mode === "war") {
        const alliedSelector = buildAllianceSelector(options.sideAllianceIds);
        return `https://www.locutus.link/#/war?selector=${enemySelector}&allies=${alliedSelector}`;
    }

    if (options.mode === "raid") {
        return `https://www.locutus.link/#/raid?selector=${enemySelector}`;
    }

    if (options.mode === "spy") {
        return `https://www.locutus.link/#/spy?selector=${enemySelector}`;
    }

    return `https://www.locutus.link/#/damage?selector=${enemySelector}`;
}
