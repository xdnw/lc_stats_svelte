import type { Conflict } from "./types";

export function trimHeader(header: string) {
    if (header.includes('_value')) {
        header = `~$${header.replace('_value', '')}`;
    }
    if (header.includes('_loss')) {
        header = header.replace('_loss', '');
    }
    if (header.includes('loss_')) {
        header = header.replace('loss_', '');
    }
    if (header === '~$loss') {
        header = 'damage';
    }
    return header.replaceAll('_', ' ');
}

export function getDefaultWarWebHeader(data: { war_web: { headers: string[] } }): string {
    if (data.war_web.headers.includes('wars')) return 'wars';
    return data.war_web.headers[0] ?? 'wars';
}

function normalizeWarWebMatrixValue(value: unknown): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

export function rankWarWebAllianceIdsByTotalMetric(
    data: Pick<Conflict, "coalitions" | "war_web">,
    header: string,
): [number[], number[]] {
    const coalition0Ids =
        data.coalitions[0]?.alliance_ids.map((id) => Number(id)) ?? [];
    const coalition1Ids =
        data.coalitions[1]?.alliance_ids.map((id) => Number(id)) ?? [];
    const headerIndex = data.war_web.headers.indexOf(header);

    if (headerIndex < 0) {
        return [coalition0Ids, coalition1Ids];
    }

    const matrix = data.war_web.data[headerIndex] as number[][];
    const totalAllianceCount = coalition0Ids.length + coalition1Ids.length;
    const scoreByMatrixIndex = Array.from(
        { length: totalAllianceCount },
        (_value, allianceIndex) => {
            let total = 0;
            for (let otherIndex = 0; otherIndex < totalAllianceCount; otherIndex += 1) {
                total += normalizeWarWebMatrixValue(matrix[allianceIndex]?.[otherIndex]);
                total += normalizeWarWebMatrixValue(matrix[otherIndex]?.[allianceIndex]);
            }
            return total;
        },
    );

    function rankCoalition(allianceIds: number[], offset: number): number[] {
        return allianceIds
            .map((allianceId, localIndex) => ({
                allianceId,
                matrixIndex: offset + localIndex,
                score: scoreByMatrixIndex[offset + localIndex] ?? 0,
            }))
            .sort(
                (left, right) =>
                    right.score - left.score ||
                    left.matrixIndex - right.matrixIndex ||
                    left.allianceId - right.allianceId,
            )
            .map((entry) => entry.allianceId);
    }

    return [
        rankCoalition(coalition0Ids, 0),
        rankCoalition(coalition1Ids, coalition0Ids.length),
    ];
}

export type WarWebMetricMeta = {
    primaryToRowLabel: (h: string) => string;
    rowToPrimaryLabel: (h: string) => string;
    directionNote: (h: string) => string;
};

export function resolveWarWebMetricMeta(header: string): WarWebMetricMeta {
    if (header.endsWith('_loss') || header.endsWith('_loss_value') || header === 'loss_value') {
        return {
            primaryToRowLabel: (h) => `${h} inflicted by Compared`,
            rowToPrimaryLabel: (h) => `${h} inflicted by Selected`,
            directionNote: (h) =>
                `${h} counts losses inflicted by each side in battles against the other.`,
        };
    }
    if (header.startsWith('consume_')) {
        return {
            primaryToRowLabel: (h) => `${h} consumed by Selected`,
            rowToPrimaryLabel: (h) => `${h} consumed by Compared`,
            directionNote: (h) =>
                `${h} is the resources consumed by each side during battles against the other.`,
        };
    }
    if (header === 'loot_value') {
        return {
            primaryToRowLabel: () => 'Loot taken by Compared',
            rowToPrimaryLabel: () => 'Loot taken by Selected',
            directionNote: () =>
                'loot_value is the loot taken by each side from the other.',
        };
    }
    if (header.endsWith('_attacks') || header === 'attacks') {
        return {
            primaryToRowLabel: (h) => `${h} by Selected`,
            rowToPrimaryLabel: (h) => `${h} by Compared`,
            directionNote: (h) =>
                `${h} counts attacks launched by each side against the other.`,
        };
    }
    if (header.startsWith('wars_') || header.endsWith('_wars') || header === 'wars') {
        return {
            primaryToRowLabel: (h) => `${h} as attacker: Selected`,
            rowToPrimaryLabel: (h) => `${h} as attacker: Compared`,
            directionNote: (h) =>
                `${h} counts wars where each side was the attacker/initiator.`,
        };
    }
    return {
        primaryToRowLabel: (h) => `${h} (Compared → Selected)`,
        rowToPrimaryLabel: (h) => `${h} (Selected → Compared)`,
        directionNote: (h) =>
            `${h}: "Selected" is the value attributed to Compared coalition, "Compared" to the Selected coalition.`,
    };
}
